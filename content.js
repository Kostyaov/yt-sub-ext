// Константи та налаштування
const DEBUG = true;
const MIN_SUBTITLE_INTERVAL = 200; // мінімальний інтервал між субтитрами (мс)
const INIT_DELAY = 3000; // затримка перед початком роботи (мс)
const IS_EDGE = navigator.userAgent.indexOf("Edg") !== -1;


// Змінні для відстеження стану
let edgeVoices = [];
let lastSubtitle = '';
let lastSubtitleTime = 0;
let audioPlayer = null;
let isProcessingSubtitle = false;
let isEnabled = true; // Значення за замовчуванням, оновлюється з налаштувань

// Отримання українських голосів в Edge
function getEdgeVoices() {
  return new Promise((resolve) => {
    const checkVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) {
        // Якщо голоси ще не завантажено, спробуємо ще раз через 100 мс
        setTimeout(checkVoices, 100);
        return;
      }
      
      // Фільтруємо українські голоси
      const ukrainianVoices = voices.filter(voice => 
        voice.lang.includes('uk') || voice.lang.includes('UA')
      );
      
      resolve(ukrainianVoices);
    };
    
    checkVoices();
  });
}

// Функція для відбору голосів в Edge за їх правильними іменами
function selectVoiceForEdge(voicePreference) {
  const voices = window.speechSynthesis.getVoices();
  let selectedVoice = null;
  
  // Map імен голосів з EdgeTTS на Web Speech API
  const voiceMapping = {
    'uk-UA-PolinaNeural': 'Microsoft Polina Online',
    'uk-UA-OstapNeural': 'Microsoft Ostap Online'
  };
  
  // Визначаємо, який голос шукати
  const searchTerm = voiceMapping[voicePreference] || voicePreference;
  
  log('Шукаємо голос за запитом:', searchTerm);
  
  // Виведемо всі доступні голоси для діагностики
  if (DEBUG) {
    log('Доступні голоси:');
    voices.forEach(voice => {
      log(`- ${voice.name} (${voice.lang})`);
    });
  }
  
  // Шукаємо відповідний голос
  selectedVoice = voices.find(voice => 
    voice.name.includes(searchTerm) && 
    (voice.lang.includes('uk') || voice.lang.includes('UA'))
  );
  
  // Якщо не знайдено, беремо будь-який український голос
  if (!selectedVoice) {
    log('Не знайдено голос за запитом, шукаємо будь-який український голос');
    selectedVoice = voices.find(voice => 
      voice.lang.includes('uk') || voice.lang.includes('UA')
    );
  }
  
  // Якщо взагалі немає українських голосів, беремо будь-який
  if (!selectedVoice && voices.length > 0) {
    log('Українських голосів не знайдено, використовуємо перший доступний');
    selectedVoice = voices[0];
  }
  
  return selectedVoice;
}

// Функція для озвучування через Edge
function speakWithEdge(text, voicePreference = 'uk-UA-PolinaNeural', rate = 1.0) {
  return new Promise(async (resolve, reject) => {
    try {
      // Зупиняємо поточне озвучування, якщо є
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'uk-UA';
      utterance.rate = rate;
      
      // Вибираємо голос відповідно до налаштувань
      const selectedVoice = selectVoiceForEdge(voicePreference);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        log(`Використовується голос: ${selectedVoice.name} (${selectedVoice.lang})`);
      } else {
        log('Не знайдено відповідний голос, використовується голос за замовчуванням');
      }
      
      utterance.onend = () => {
        log('Edge TTS: озвучування завершено');
        resolve();
      };
      
      utterance.onerror = (error) => {
        log('Edge TTS: помилка', error);
        reject(error);
      };
      
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      log('Edge TTS: виникла помилка', error);
      reject(error);
    }
  });
}

// Логування з можливістю відключення
function log(...args) {
  if (DEBUG) {
    console.log('[YT-UA-TTS]', ...args);
  }
}

// Ініціалізація розширення
async function initialize() {
  log('Ініціалізація розширення...');
  
  // Перевірка чи сторінка YouTube
  if (!window.location.hostname.includes('youtube.com')) {
    log('Не YouTube сторінка, розширення не активоване');
    return;
  }
  
  // Якщо це Edge, ініціалізуємо голоси
  if (IS_EDGE) {
    log('Виявлено браузер Edge, отримання голосів...');
    try {
      const voices = await getEdgeVoices();
      log(`Знайдено ${voices.length} українських голосів в Edge`);
      if (voices.length > 0) {
        voices.forEach(voice => {
          log(`- ${voice.name} (${voice.lang})`);
        });
      }
    } catch (error) {
      log('Помилка при отриманні голосів Edge:', error);
    }
  }
  
  // Завантаження налаштувань
  try {
    const settings = await chrome.storage.sync.get({
      enabled: true,
      voice: 'uk-UA-PolinaNeural',
      speed: 100
    });
    
    isEnabled = settings.enabled;
    log(`Налаштування завантажено. Озвучування ${isEnabled ? 'увімкнено' : 'вимкнено'}`);
  } catch (error) {
    log('Помилка завантаження налаштувань, використовуємо значення за замовчуванням:', error);
  }
  
  // Створюємо аудіо елемент для не-Edge
  if (!IS_EDGE) {
    audioPlayer = new Audio();
    audioPlayer.addEventListener('ended', () => {
      log('Аудіо відтворення завершено');
      isProcessingSubtitle = false;
    });
    
    audioPlayer.addEventListener('error', (e) => {
      log('Помилка відтворення аудіо:', e);
      isProcessingSubtitle = false;
    });
  }
  
  // Починаємо спостереження за субтитрами після затримки
  log(`Чекаємо ${INIT_DELAY}мс перед запуском спостереження...`);
  setTimeout(setupSubtitleObserver, INIT_DELAY);
  
  // Додаємо обробник повідомлень для оновлення налаштувань у реальному часі
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'settingsUpdated') {
      log('Отримано оновлення налаштувань:', message.settings);
      isEnabled = message.settings.enabled;
    }
    
    // Лише для не-Edge браузерів
    if (!IS_EDGE) {
      if (message.action === 'playAudio' && message.audioData) {
        log('Отримано аудіо для відтворення');
        
        // Відтворюємо отримане аудіо
        audioPlayer.src = message.audioData;
        audioPlayer.play()
          .then(() => log('Аудіо відтворюється'))
          .catch(error => {
            log('Помилка відтворення:', error);
            isProcessingSubtitle = false;
          });
      } else if (message.action === 'ttsError') {
        log('Помилка TTS:', message.error);
        isProcessingSubtitle = false;
      }
    }
  });
}

// Налаштування спостереження за субтитрами
function setupSubtitleObserver() {
  log('Налаштування спостереження за субтитрами...');
  
  // Пошук існуючого контейнера субтитрів
  function findSubtitleContainer() {
    // Спробуємо знайти контейнери субтитрів різних типів
    const containers = [
      document.querySelector('.ytp-caption-window-container'), // Автоматичні субтитри
      document.querySelector('.caption-window'),               // Ручні субтитри
      document.querySelector('.captions-text')                 // Інший формат субтитрів
    ];
    
    return containers.find(container => container !== null);
  }
  
  // Отримання актуального тексту субтитрів
  function getCurrentSubtitle() {
    // Спробуємо різні селектори для пошуку субтитрів
    const selectors = [
      '.ytp-caption-segment',      // Автоматичні субтитри
      '.caption-visual-line',      // Ручні субтитри
      '.captions-text span'        // Інший формат субтитрів
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Об'єднуємо текст з усіх сегментів
        return Array.from(elements)
          .map(el => el.textContent.trim())
          .filter(text => text.length > 0)
          .join(' ');
      }
    }
    
    return null;
  }
  
  // Перевірка чи містить текст спеціальні фрази
  function shouldSkipSubtitle(text) {
    const lowerText = text.toLowerCase();
    
    // Масив фраз для фільтрації
    const phrasesToSkip = [
      '[музика]',
      '(музика)',
      '[оплески]',
      '[сміх]',
      '[двигун ревіння]',
      '(створено автоматично)',
      '⚙'
    ];
    
    // Перевіряємо чи текст містить будь-яку з цих фраз
    for (const phrase of phrasesToSkip) {
      if (lowerText.includes(phrase)) {
        log(`Пропускаємо субтитр, що містить "${phrase}"`);
        return true;
      }
    }
    
    // Не пропускаємо звичайний текст
    return false;
  }

  // Обробка зміни субтитрів
function handleSubtitleChange() {
  // Якщо озвучування вимкнено або вже обробляємо субтитр
  if (!isEnabled || isProcessingSubtitle) {
    return;
  }
  
  const subtitle = getCurrentSubtitle();
  const now = Date.now();
  
  // Перевіряємо чи є текст, чи він новий, і чи пройшов мінімальний інтервал,
  // і чи він не належить до спеціальних фраз, які треба пропустити
  if (subtitle && 
      subtitle !== lastSubtitle && 
      now - lastSubtitleTime > MIN_SUBTITLE_INTERVAL &&
      !shouldSkipSubtitle(subtitle)) {
    
    log('Новий субтитр:', subtitle);
    lastSubtitle = subtitle;
    lastSubtitleTime = now;
    isProcessingSubtitle = true;
    
    // Різна обробка для Edge і не-Edge
    if (IS_EDGE) {
      // Отримуємо налаштування голосу та швидкості
      chrome.storage.sync.get({ 
        voice: 'uk-UA-PolinaNeural',
        speed: 100 
      }, (settings) => {
        // Відтворюємо з Edge TTS з правильним голосом
        speakWithEdge(subtitle, settings.voice, settings.speed / 100)
          .then(() => {
            isProcessingSubtitle = false;
          })
          .catch(error => {
            log('Помилка озвучування Edge TTS:', error);
            isProcessingSubtitle = false;
          });
      });
    } else {
      // Відправляємо запит на озвучення через сервер (існуючий код)
      chrome.runtime.sendMessage({
        action: 'speak',
        text: subtitle
      });
    }
  } else if (subtitle && shouldSkipSubtitle(subtitle)) {
    log('Пропущено спеціальний субтитр:', subtitle);
    lastSubtitle = subtitle; // Зберігаємо субтитр як останній, щоб уникнути повторної обробки
    lastSubtitleTime = now;
  }
}
  
  // Пошук контейнера і налаштування спостереження
  const subtitleContainer = findSubtitleContainer();
  
  if (subtitleContainer) {
    log('Знайдено контейнер субтитрів, починаємо спостереження');
    
    const observer = new MutationObserver(handleSubtitleChange);
    observer.observe(subtitleContainer, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Додатково перевіряємо субтитри періодично
    setInterval(handleSubtitleChange, 500);
  } else {
    log('Контейнер субтитрів не знайдено, повторна перевірка через 2с');
    setTimeout(setupSubtitleObserver, 2000);
  }
}

// Запуск ініціалізації
initialize();