document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const saveBtn = document.getElementById('saveBtn');
  const successMessage = document.getElementById('successMessage');
  const promptChoiceRadios = document.querySelectorAll('input[name="promptChoice"]');
  const readyPromptSection = document.getElementById('readyPromptSection');
  const customPromptSection = document.getElementById('customPromptSection');
  const readyPromptSelect = document.getElementById('readyPrompt');
  const customPromptTextarea = document.getElementById('customPrompt');
  const modelChoiceRadios = document.querySelectorAll('input[name="modelChoice"]');
  const openaiApiSection = document.getElementById('openaiApiSection');
  const geminiApiSection = document.getElementById('geminiApiSection');

  // Kayıtlı ayarları yükle
  chrome.storage.sync.get(['openai_api_key', 'gemini_api_key', 'promptChoice', 'readyPrompt', 'customPrompt', 'modelChoice'], function(data) {
    if (data.openai_api_key) {
      apiKeyInput.value = data.openai_api_key;
    }
    if (data.gemini_api_key) {
      geminiApiKeyInput.value = data.gemini_api_key;
    }
    if (data.promptChoice) {
      document.querySelector(`input[name="promptChoice"][value="${data.promptChoice}"]`).checked = true;
      togglePromptSections(data.promptChoice);
    }
    if (data.readyPrompt) {
      readyPromptSelect.value = data.readyPrompt;
    }
    if (data.customPrompt) {
      customPromptTextarea.value = data.customPrompt;
    }
    if (data.modelChoice) {
      document.querySelector(`input[name="modelChoice"][value="${data.modelChoice}"]`).checked = true;
      toggleApiSections(data.modelChoice);
    } else {
      toggleApiSections('openai'); // Varsayılan olarak OpenAI
    }
  });

  // Prompt seçimi değiştiğinde ilgili alanı göster/gizle
  promptChoiceRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      togglePromptSections(this.value);
    });
  });

  // Model seçimi değiştiğinde ilgili API anahtar alanını göster/gizle
  modelChoiceRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      toggleApiSections(this.value);
    });
  });

  function togglePromptSections(choice) {
    if (choice === 'ready') {
      readyPromptSection.style.display = 'block';
      customPromptSection.style.display = 'none';
    } else if (choice === 'custom') {
      readyPromptSection.style.display = 'none';
      customPromptSection.style.display = 'block';
    }
  }

  function toggleApiSections(model) {
    if (model === 'openai') {
      openaiApiSection.style.display = 'block';
      geminiApiSection.style.display = 'none';
    } else if (model === 'gemini') {
      openaiApiSection.style.display = 'none';
      geminiApiSection.style.display = 'block';
    }
  }

  // Kaydet butonuna tıklandığında
  saveBtn.addEventListener('click', function() {
    const openaiApiKey = apiKeyInput.value.trim();
    const geminiApiKey = geminiApiKeyInput.value.trim();
    const selectedPromptChoice = document.querySelector('input[name="promptChoice"]:checked').value;
    const selectedModelChoice = document.querySelector('input[name="modelChoice"]:checked').value;
    let selectedReadyPrompt = '';
    let enteredCustomPrompt = '';

    if (selectedPromptChoice === 'ready') {
      selectedReadyPrompt = readyPromptSelect.value;
    } else if (selectedPromptChoice === 'custom') {
      enteredCustomPrompt = customPromptTextarea.value.trim();
    }

    // Seçilen modele göre API anahtarının dolu olup olmadığını kontrol et
    const isApiKeyValid = (selectedModelChoice === 'openai' && openaiApiKey) || 
                          (selectedModelChoice === 'gemini' && geminiApiKey);

    if (isApiKeyValid) {
      // Ayarları kaydet
      chrome.storage.sync.set({
        'openai_api_key': openaiApiKey,
        'gemini_api_key': geminiApiKey,
        'promptChoice': selectedPromptChoice,
        'readyPrompt': selectedReadyPrompt,
        'customPrompt': enteredCustomPrompt,
        'modelChoice': selectedModelChoice
      }, function() {
        // Başarı mesajını göster
        successMessage.style.display = 'block';

        // 2 saniye sonra mesajı gizle
        setTimeout(function() {
          successMessage.style.display = 'none';
        }, 2000);
      });
    }
  });
});