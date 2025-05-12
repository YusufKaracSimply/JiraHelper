(() => {
  const jiraTicketRegex = /https:\/\/simplydeliver\.atlassian\.net\/(?:browse|jira\/servicedesk\/projects\/SSD\/queues\/custom\/\d+)\/SSD-\d+/;

  const isJiraTicketPage = () => jiraTicketRegex.test(window.location.href);
  const getJiraContent = (element) => element?.textContent?.trim();
  const cleanupPopup = () => document.getElementById('ai-summary-popup')?.remove();

  // Her eleman için benzersiz bir anahtar oluştur
  const getStorageKey = (elementId) => {
    const ticketId = window.location.href.match(/SSD-\d+/)[0];
    return `jira-ai-summary-${ticketId}-${elementId}`;
  };

  // Geçerli ticket için storage anahtarını al
  const getCurrentTicketKey = () => {
    const ticketId = window.location.href.match(/SSD-\d+/)?.[0];
    return ticketId ? `jira-ai-summary-${ticketId}` : null;
  };

  const getApiKey = async () => {
    const { openai_api_key, gemini_api_key, modelChoice } = await new Promise(resolve => 
      chrome.storage.sync.get(['openai_api_key', 'gemini_api_key', 'modelChoice'], resolve)
    );
    return { 
      openaiApiKey: openai_api_key, 
      geminiApiKey: gemini_api_key, 
      modelChoice: modelChoice || 'openai' // Varsayılan olarak OpenAI
    };
  };
  
  const getPromptSettings = () => {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['promptChoice', 'readyPrompt', 'customPrompt'], (data) => {
        resolve({
          promptChoice: data.promptChoice,
          readyPrompt: data.readyPrompt,
          customPrompt: data.customPrompt
        });
      });
    });
  };
  
  const callOpenAI = async (content) => {
    const { openaiApiKey, geminiApiKey, modelChoice } = await getApiKey();
    
    // Seçilen modele göre API anahtarını kontrol et
    const apiKey = modelChoice === 'openai' ? openaiApiKey : geminiApiKey;
    
    if (!apiKey) {
      console.error("API anahtarı bulunamadı. Lütfen uzantı ayarlarından API anahtarınızı girin.");
      return "API anahtarı bulunamadı. Lütfen uzantı ayarlarından API anahtarınızı girin.";
    }
  
    const promptSettings = await getPromptSettings();
    let promptContent = '';
  
    if (promptSettings.promptChoice === 'custom') {
      promptContent = promptSettings.customPrompt;
    } else {
      promptContent = `Bir Jira talebindeki temel bilgileri özetle. Lütfen aşağıdaki adımları takip et:
                 1. Müşterinin talep ettiği ana işlevselliği veya sorunu kısa bir cümle ile özetle. (Özet tamamen Türkçe olmalı, ancak teknik terimler ingilizce olabilir.)
                 2. İlk özet bölümünde 1-2 cümle ile kritik noktaları belirt.
                 3. İkinci bölümde, daha detaylı bir özet oluştur çok da uzun olmasın; bu özette müşteri talebindeki önem sırasına, aciliyet durumuna ve gerekli ek bilgilere yer ver.
                 Gerektiğinde ek örnek veya açıklama da ekleyebilirsin. çıktıda başlıklar kısa olsun`; // Varsayılan prompt
      console.log("Prompt seçeneği bulunamadı, varsayılan prompt kullanılıyor.");
    }
  
    const systemPrompt =
      `${promptContent}\n\nTalep içeriği: ${content}\n\nÖzeti Türkçe olarak verin.`;
    
    try {
      // Seçilen modele göre API çağrısı yap
      if (modelChoice === 'openai') {
        return await callOpenAIApi(apiKey, systemPrompt, content);
      } else {
        return await callGeminiApi(apiKey, systemPrompt, content);
      }
    } catch (error) {
      console.error("API hatası:", error);
      return `Özet alınamadı. Hata: ${error.message}. Lütfen API ayarlarınızı ve internet bağlantınızı kontrol edin.`;
    }
  };
  
  const callOpenAIApi = async (apiKey, systemPrompt, content) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: content }
        ],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API hatası: ${response.status} ${response.statusText}`, errorText);
      return `OpenAI API hatası: ${response.status} ${response.statusText}`;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "API yanıtında özet bulunamadı.";
  };
  
  const callGeminiApi = async (apiKey, systemPrompt, content) => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              { text: content }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.4
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API hatası: ${response.status} ${response.statusText}`, errorText);
      return `Gemini API hatası: ${response.status} ${response.statusText}`;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "API yanıtında özet bulunamadı.";
  };

  const showPopup = (content, element, isStandalone = false) => {
    cleanupPopup();

    const popup = document.createElement('div');
    popup.id = 'ai-summary-popup';
    popup.className = 'ai-summary-popup';
    popup.innerHTML = `
      <div class="popup-header">
        <h2>🧠 AI Summary</h2>
        <button class="popup-close-btn" aria-label="Kapat">✖</button>
      </div>
      <div class="popup-content">
        ${content.replace(/\n/g, '<br>').replace(/\*\*/g, '').replace(/###/g, '#')
      }
      </div>
      <div class="popup-actions">
        <button id="re-summarize-btn" class="re-summarize-btn" style='margin-top:10px'> Summarize Again</button>
      </div>
    `;

    const closeButton = popup.querySelector('.popup-close-btn');
    closeButton.addEventListener('click', () => popup.remove());

    const reSummarizeButton = popup.querySelector('#re-summarize-btn');
    reSummarizeButton.addEventListener('click', async () => {
      reSummarizeButton.textContent = 'Loading...';
      reSummarizeButton.disabled = true;
      const contentToSummarize = isStandalone ? document.querySelector('.ak-renderer-document')?.textContent?.trim() : getJiraContent(element);
      if (!contentToSummarize) {
        showPopup("Özetlenecek içerik bulunamadı.");
        reSummarizeButton.textContent = 'Summarize Again';
        reSummarizeButton.disabled = false;
        return;
      }
      const newSummary = await callOpenAI(contentToSummarize);
      popup.querySelector('.popup-content').innerHTML = newSummary.replace(/\n/g, '<br>').replace(/\*\*/g, '').replace(/###/g, '#');
      reSummarizeButton.textContent = 'Tekrar Özetle';
      reSummarizeButton.disabled = false;
      if (isStandalone) {
        saveStandaloneSummary(newSummary);
        const standaloneButton = document.getElementById('ai-summary-button');
        if (standaloneButton) {
          standaloneButton.style.backgroundColor = '#00875A';
          standaloneButton.title = 'Kaydedilmiş özet mevcut';
        }
      } else {
        const elementIndex = element.dataset.elementIndex;
        if (elementIndex) {
          saveSummaryForElement(elementIndex, newSummary);
          const originalButton = element.querySelector('.ai-summary-button');
          if (originalButton) {
            originalButton.style.backgroundColor = '#00875A';
            originalButton.title = 'Kaydedilmiş özet mevcut';
          }
        }
      }
    });

    document.body.appendChild(popup);

    setTimeout(() => {
      document.addEventListener('click', closePopupOutside);
    }, 0);
  };

  const closePopupOutside = (event) => {
    const popup = document.getElementById('ai-summary-popup');
    if (popup && !popup.contains(event.target) && !event.target.classList.contains('ai-summary-button') && !event.target.classList.contains('re-summarize-btn')) {
      popup.remove();
      document.removeEventListener('click', closePopupOutside);
    }
  };

  // Belirli bir eleman için özeti kaydet
  const saveSummaryForElement = (elementId, summary) => {
    const storageKey = getStorageKey(elementId);
    localStorage.setItem(storageKey, summary);
  };

  // Standalone özet için kaydet
  const saveStandaloneSummary = (summary) => {
    const ticketKey = getCurrentTicketKey();
    if (ticketKey) {
      localStorage.setItem(ticketKey, summary);
      window.jiraSummarizerLastSummary = summary;
    }
  };

  // Belirli bir eleman için özeti kontrol et
  const getSavedSummaryForElement = (elementId) => {
    const storageKey = getStorageKey(elementId);
    return localStorage.getItem(storageKey);
  };

  // Standalone özeti kontrol et
  const getSavedStandaloneSummary = () => {
    const ticketKey = getCurrentTicketKey();
    if (ticketKey) {
      return localStorage.getItem(ticketKey) ||
             window.jiraSummarizerLastSummary;
    }
    return null;
  };

  // --- İlk Bloktaki Fonksiyonlar ---

  const createSummaryButton = (index) => {
    const button = document.createElement('button');
    button.className = 'ai-summary-button';
    button.textContent = 'Summarize w/ AI';
    button.style.cssText = `
      background-color: #0052CC;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      position: absolute;
      top: 5px;
      right: 5px;
    `;
    button.dataset.elementIndex = index;
    return button;
  };

  const addSummaryButtonToElement = (element, index) => {
    const currentPosition = window.getComputedStyle(element).position;
    if (currentPosition === 'static') {
      element.style.position = 'relative';
    }
    element.dataset.elementIndex = index; // Elemente index'i ekle

    const button = createSummaryButton(index);
    element.appendChild(button);

    if (index > 0) {
      // Kayıtlı özet varsa butonun rengini değiştir
      const savedSummary = getSavedSummaryForElement(index);
      if (savedSummary) {
        button.style.backgroundColor = '#00875A';
        button.title = 'Kaydedilmiş özet mevcut';
      }

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleElementSummaryClick(element, button, index);
      });
    } else {
      button.style.backgroundColor = '#00875A';
    }
  };

  const handleElementSummaryClick = async (element, button, elementId) => {
    // Önce kayıtlı özeti kontrol et
    const savedSummary = getSavedSummaryForElement(elementId);

    if (savedSummary) {
      // Kayıtlı özet varsa direkt göster
      showPopup(savedSummary, element);
      return;
    }

    // Kayıtlı özet yoksa yeni özet oluştur
    const originalText = button.textContent;
    button.textContent = 'Loading...';
    button.disabled = true;

    const content = getJiraContent(element);
    if (!content) {
      showPopup("Özetlenecek içerik bulunamadı.", element);
      button.textContent = originalText;
      button.disabled = false;
      return;
    }

    try {
      const summary = await callOpenAI(content);
      // Özeti kaydet
      saveSummaryForElement(elementId, summary);
      // Butonun rengini değiştir
      button.style.backgroundColor = '#00875A';
      button.title = 'Kaydedilmiş özet mevcut';
      // Özeti göster
      showPopup(summary, element);
    } catch (error) {
      showPopup(`Özet alınamadı. Hata: ${error.message}`, element);
    }

    button.textContent = originalText;
    button.disabled = false;
  };

  async function processAllDocuments() {
    if (!isJiraTicketPage()) return;

    cleanupPopup();

    const documentElements = document.querySelectorAll('.ak-renderer-document');
    if (!documentElements.length) {
      setTimeout(processAllDocuments, 500);
      return;
    }

    documentElements.forEach((element, index) => {
      if (index != '0') {
        addSummaryButtonToElement(element, index);
      }
    });
  }

  // --- İkinci Bloktaki Fonksiyonlar ---

  const createStandaloneButton = () => {
    const button = document.createElement('button');
    button.id = 'ai-summary-button';
    button.textContent = 'Summarize w/ AI';

    // Kayıtlı özet varsa butonun rengini değiştir
    const savedSummary = getSavedStandaloneSummary();
    if (savedSummary) {
      button.style.cssText = `background-color: #00875A; color: white; border: none; border-radius: 3px; padding: 8px 12px; cursor: pointer; font-size: 14px; font-weight: bold; margin-top: 10px; position: relative;margin-right:250px;z-index:10001`;
      button.title = 'Kaydedilmiş özet mevcut';
    } else {
      button.style.cssText = `background-color: #0052CC; color: white; border: none; border-radius: 3px; padding: 8px 12px; cursor: pointer; font-size: 14px; font-weight: bold; margin-top: 10px; position: relative;margin-right:250px;z-index:10001`;
    }

    button.addEventListener('click', showStandaloneSummary);
    return button;
  };

  const insertStandaloneButton = (button) => {
    const target = document.querySelector('.css-1pjflpu');

    if (!target) return;
    let container = document.getElementById('ai-summary-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ai-summary-container';
      container.style.cssText = `position: absolute; top: 10px; right: 10px;`;
      target.appendChild(container);
    }
    container.appendChild(button);
  };

  async function processStandaloneSummary() {
    if (!isJiraTicketPage()) return;
    cleanupPopup();

    // Mevcut ticketın içeriğini al
    const content = document.querySelector('.ak-renderer-document')?.textContent?.trim();
    if (!content) {
      setTimeout(processStandaloneSummary, 300);
      return;
    }

    let button = document.getElementById('ai-summary-button');
    if (!button) {
      button = createStandaloneButton();
      insertStandaloneButton(button);
    }

    // Kayıtlı özet yoksa yeni özet al
    const savedSummary = getSavedStandaloneSummary();
    if (!savedSummary) {
      const originalText = button.textContent;
      button.textContent = 'Loading...';
      button.disabled = true;

      try {
        const summary = await callOpenAI(content);
        saveStandaloneSummary(summary);

        // Özeti aldıktan sonra butonun rengini değiştir
        button.style.backgroundColor = '#00875A';
        button.title = 'Kaydedilmiş özet mevcut';
        button.disabled = false;
        button.textContent = originalText;
      } catch (error) {
        console.error("Özet alınamadı:", error);
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  function showStandaloneSummary(event) {
    event?.preventDefault();
    event?.stopPropagation();

    cleanupPopup();

    // Önce kayıtlı özeti kontrol et
    const savedSummary = getSavedStandaloneSummary();

    if (savedSummary) {
      // Kayıtlı özet varsa direkt göster
      showPopup(savedSummary, null, true);
      return;
    }

    // Kayıtlı özet yoksa yeni özet al
    const button = document.getElementById('ai-summary-button');
    if (button) {
      const originalText = button.textContent;
      button.textContent = 'Loading...';
      button.disabled = true;

      const content = document.querySelector('.ak-renderer-document')?.textContent?.trim();
      if (!content) {
        showPopup("Özetlenecek içerik bulunamadı.");
        button.textContent = originalText;
        button.disabled = false;
        return;
      }

      callOpenAI(content).then(summary => {
        saveStandaloneSummary(summary);
        button.style.backgroundColor = '#00875A';
        button.title = 'Kaydedilmiş özet mevcut';
        button.disabled = false;
        button.textContent = originalText;
        showPopup(summary, null, true);
      }).catch(error => {
        showPopup(`Özet alınamadı. Hata: ${error.message}`);
        button.disabled = false;
        button.textContent = originalText;
      });
    } else {
      showPopup("Özet bulunamadı. Lütfen sayfayı yenileyip tekrar deneyin.");
    }
  }

  // --- Ortak Stiller ---
  
  const style = document.createElement('style');
  style.textContent = `
    .ai-summary-popup {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      padding: 28px 36px;
      z-index: 100000;
      max-width: 640px;
      max-height: 80vh;
      overflow-y: auto;
      font-family: 'Inter', 'Segoe UI', sans-serif;
      color: #2c2c2c;
      animation: fadeIn 0.2s ease-out;
    }
  
    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
  
    .popup-header h2 {
      font-size: 22px;
      margin: 0;
    }
  
    .popup-close-btn {
      background: none;
      border: none;
      font-size: 20px;
      color: #aaa;
      cursor: pointer;
      transition: color 0.2s ease;
    }
  
    .popup-close-btn:hover {
      color: #444;
    }
  
    .popup-content {
      font-size: 16px;
      line-height: 1.7;
    }
  
    @keyframes fadeIn {
      from { opacity: 0; transform: translate(-50%, -48%); }
      to { opacity: 1; transform: translate(-50%, -50%); }
    }
  
    .loading-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s linear infinite;
    }
  
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  // --- Sayfa Yükleme ve URL Değişikliği Dinleyicileri ---
  
  if (isJiraTicketPage()) {
    setTimeout(processAllDocuments, 200); // İlk blok için
    setTimeout(processStandaloneSummary, 200); // İkinci blok için
  }
  
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (isJiraTicketPage()) {
        setTimeout(processAllDocuments, 200); // İlk blok için
        setTimeout(processStandaloneSummary, 200); // İkinci blok için
      }
    }
  }).observe(document, { subtree: true, childList: true });
})();