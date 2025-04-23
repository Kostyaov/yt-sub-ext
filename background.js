// Константи
const TTS_SERVER_URL = 'http://localhost:3000/speak';

// Значення за замовчуванням
const DEFAULT_SETTINGS = {
  enabled: true,
  voice: 'uk-UA-PolinaNeural',
  speed: 100
};

// Логування ініціалізації
console.log('Background script запущено');

// Початкове встановлення налаштувань, якщо вони відсутні
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    console.log('Початкові налаштування:', settings);
  } catch (error) {
    console.error('Помилка при встановленні початкових налаштувань:', error);
    // У разі помилки встановлюємо значення за замовчуванням
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});

// Обробник повідомлень від content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'speak') {
    console.log('Отримано запит на озвучення:', request.text);
    
    // Спочатку перевіряємо, чи озвучування ввімкнено
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      if (!settings.enabled) {
        console.log('Озвучування вимкнено в налаштуваннях');
        sendResponse({ success: false, reason: 'disabled' });
        return;
      }
      
      // Формуємо швидкість у правильному форматі для EdgeTTS (+X%)
      const speedRate = settings.speed > 100 ? `+${settings.speed - 100}%` : '+0%';
      
      // Асинхронний запит до TTS сервера
      fetchAudio(request.text, settings.voice, speedRate)
        .then(audioData => {
          // Відправляємо аудіо назад до content script
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'playAudio',
            audioData: audioData
          });
        })
        .catch(error => {
          console.error('Помилка при отриманні аудіо:', error);
          // Повідомляємо про помилку
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'ttsError',
            error: error.message
          });
        });
    });
    
    // Повідомляємо контент-скрипт що запит прийнято
    return true; // Важливо для асинхронних відповідей
  }
});

// Функція для отримання аудіо від сервера
async function fetchAudio(text, voice, rate) {
  try {
    console.log(`Надсилаємо запит до TTS сервера: голос=${voice}, швидкість=${rate}`);
    
    const response = await fetch(TTS_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        voice: voice,
        rate: rate
      })
    });
    
    if (!response.ok) {
      throw new Error(`Помилка сервера: ${response.status}`);
    }
    
    // Отримуємо аудіо як base64 для передачі через повідомлення
    const blob = await response.blob();
    const base64data = await blobToBase64(blob);
    
    console.log('Аудіо отримано успішно');
    return base64data;
  } catch (error) {
    console.error('Помилка отримання аудіо:', error);
    throw error;
  }
}

// Конвертація blob у base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Обробник налаштувань для встановлення значка розширення
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) {
    // Оновлюємо статус значка залежно від стану enabled
    const enabled = changes.enabled.newValue;
    
    if (enabled) {
      chrome.action.setIcon({ path: {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      }});
    } else {
      chrome.action.setIcon({ path: {
        "16": "icons/icon16_disabled.png",
        "32": "icons/icon32_disabled.png",
        "48": "icons/icon48_disabled.png",
        "128": "icons/icon128_disabled.png"
      }});
    }
  }
});