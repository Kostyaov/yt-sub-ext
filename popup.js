// Отримуємо посилання на елементи інтерфейсу
const enabledCheckbox = document.getElementById('enabled');
const voiceSelect = document.getElementById('voice');
const speedSlider = document.getElementById('speed');
const speedValue = document.getElementById('speed-value');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');

// функція для перевірки браузера
function isEdgeBrowser() {
  return navigator.userAgent.indexOf("Edg") !== -1;
}

// Функція для оновлення відображення швидкості при зміні слайдера
speedSlider.addEventListener('input', () => {
  speedValue.textContent = `${speedSlider.value}%`;
});

// Анімація кнопки зберігання
saveButton.addEventListener('mousedown', () => {
  saveButton.style.transform = 'scale(0.98)';
});

saveButton.addEventListener('mouseup', () => {
  saveButton.style.transform = 'scale(1)';
});

// Функція для перевірки стану сервера
async function checkServerStatus() {
  try {
    const response = await fetch('http://localhost:3000/', { 
      method: 'GET',
      timeout: 2000
    });
    
    if (response.ok) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Функція для відображення статусу
function showStatus(message, type = '') {
  statusDiv.textContent = message;
  statusDiv.className = 'status';
  
  if (type) {
    statusDiv.classList.add(type);
  }
  
  // Автоматично прибираємо статус через 3 секунди
  setTimeout(() => {
    statusDiv.textContent = 'Готово до роботи';
    statusDiv.className = 'status';
  }, 3000);
}

// Завантаження поточних налаштувань при відкритті popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Показуємо статус "Завантаження..."
    statusDiv.textContent = 'Завантаження налаштувань...';
    statusDiv.className = 'status loading';
    
    // Перевіряємо, чи це Edge
    const isEdge = isEdgeBrowser();

    // Якщо це не Edge, робимо перевірку сервера як раніше
    if (!isEdge) {
      // Перевіряємо статус сервера
      const serverActive = await checkServerStatus();
      
      if (!serverActive) {
        statusDiv.textContent = 'Сервер не запущено. Запустіть TTS сервер перед використанням.';
        statusDiv.className = 'status error';
        // Деактивуємо елементи керування
        enabledCheckbox.disabled = true;
        voiceSelect.disabled = true;
        speedSlider.disabled = true;
        saveButton.disabled = true;
        return;
      }
    } else {
      // Якщо це Edge, показуємо спеціальне повідомлення
      statusDiv.textContent = 'Використовується браузер Edge з вбудованою підтримкою українських голосів';
      statusDiv.className = 'status success';
    }
    
    // Отримуємо поточні налаштування з chrome.storage.sync
    const settings = await chrome.storage.sync.get({
      enabled: true,
      voice: 'uk-UA-PolinaNeural',
      speed: 100
    });
    
    // Застосовуємо налаштування до елементів інтерфейсу
    enabledCheckbox.checked = settings.enabled;
    voiceSelect.value = settings.voice;
    speedSlider.value = settings.speed;
    speedValue.textContent = `${settings.speed}%`;
    
    showStatus('Налаштування завантажено', 'success');
  } catch (error) {
    console.error('Помилка завантаження налаштувань:', error);
    showStatus('Помилка завантаження налаштувань', 'error');
  }
});

// Обробник натискання кнопки "Зберегти"
saveButton.addEventListener('click', async () => {
  try {
    // Змінюємо стан кнопки при збереженні
    saveButton.textContent = 'Зберігаємо...';
    saveButton.disabled = true;
    
    // Отримуємо значення з елементів інтерфейсу
    const settings = {
      enabled: enabledCheckbox.checked,
      voice: voiceSelect.value,
      speed: parseInt(speedSlider.value, 10)
    };
    
    // Зберігаємо налаштування в chrome.storage.sync
    await chrome.storage.sync.set(settings);
    
    // Надсилаємо повідомлення про зміну налаштувань до всіх активних вкладок
    const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
    
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'settingsUpdated',
          settings: settings
        });
      } catch (tabError) {
        console.log(`Не вдалося надіслати налаштування до вкладки ${tab.id}:`, tabError);
      }
    }
    
    // Відновлюємо стан кнопки
    saveButton.textContent = 'Зберегти налаштування';
    saveButton.disabled = false;
    
    showStatus('Налаштування збережено', 'success');
  } catch (error) {
    console.error('Помилка збереження налаштувань:', error);
    showStatus('Помилка збереження налаштувань', 'error');
    
    // Відновлюємо стан кнопки
    saveButton.textContent = 'Зберегти налаштування';
    saveButton.disabled = false;
  }
});