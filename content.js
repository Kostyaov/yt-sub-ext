// Константи та налаштування
const DEBUG = true;
const MIN_SUBTITLE_INTERVAL = 200; // мінімальний інтервал між субтитрами (мс)
const INIT_DELAY = 3000; // затримка перед початком роботи (мс)

// Змінні для відстеження стану
let lastSubtitle = '';
let lastSubtitleTime = 0;
let audioPlayer = null;
let isProcessingSubtitle = false;
let isEnabled = true; // Значення за замовчуванням, оновлюється з налаштувань

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
  
  // Створюємо аудіо елемент
  audioPlayer = new Audio();
  audioPlayer.addEventListener('ended', () => {
    log('Аудіо відтворення завершено');
    isProcessingSubtitle = false;
  });
  
  audioPlayer.addEventListener('error', (e) => {
    log('Помилка відтворення аудіо:', e);
    isProcessingSubtitle = false;
  });
  
  // Починаємо спостереження за субтитрами після затримки
  log(`Чекаємо ${INIT_DELAY}мс перед запуском спостереження...`);
  setTimeout(setupSubtitleObserver, INIT_DELAY);
  
  // Додаємо обробник повідомлень для оновлення налаштувань у реальному часі
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'settingsUpdated') {
      log('Отримано оновлення налаштувань:', message.settings);
      isEnabled = message.settings.enabled;
    }
    
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
    
    // Перевіряємо чи є текст, чи він новий, чи пройшов мінімальний інтервал,
    // і чи він не належить до спеціальних фраз, які треба пропустити
    if (subtitle && 
      subtitle !== lastSubtitle && 
      now - lastSubtitleTime > MIN_SUBTITLE_INTERVAL &&
      !shouldSkipSubtitle(subtitle)) {
    
    log('Новий субтитр:', subtitle);
    lastSubtitle = subtitle;
    lastSubtitleTime = now;
    isProcessingSubtitle = true;
    
    // Відправляємо запит на озвучення
    chrome.runtime.sendMessage({
      action: 'speak',
      text: subtitle
    });
    } else if (subtitle && shouldSkipSubtitle(subtitle)) {
      //log('Пропущено спеціальний субтитр:', subtitle);
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