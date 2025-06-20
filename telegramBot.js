console.log('🤖 [telegramBot.js] Loaded updated code at', new Date().toISOString());
// telegramBot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

// Initialize Firebase Admin if not already initialized
// Check if Firebase is already initialized (when imported by index.js)
const admin = require('firebase-admin');
if (!admin.apps.length) {
  try {
    // For local development: load service account key
    const serviceAccount = require('./utils/astrohabibi-firestore-sa-key.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('🗄️ Firebase Admin initialized with service account.');
  } catch (err) {
    // In production or if JSON not present, use default credentials
    admin.initializeApp();
    console.log('🗄️ Firebase Admin initialized with default credentials.');
  }
}


const { getLatestChart, saveConversationMessage, getConversationHistory } = require('./utils/firestore');


// Helper to convert a degree to sign name and degrees/minutes
function degreeToSignDetails(deg, language) {
  // Validate input
  if (typeof deg !== 'number' || isNaN(deg) || deg === null || deg === undefined) {
    console.warn('⚠️ Invalid degree value passed to degreeToSignDetails:', deg);
    return { signName: 'Unknown', degree: 0, minutes: 0 };
  }
  
  // Sign names in English and Arabic (MSA)
  const signsEn = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  const signsAr = ['الحمل','الثور','الجوزاء','السرطان','الأسد','العذراء','الميزان','العقرب','القوس','الجدي','الدلو','الحوت'];
  const signsFr = ['Bélier','Taureau','Gémeaux','Cancer','Lion','Vierge','Balance','Scorpion','Sagittaire','Capricorne','Verseau','Poissons'];
  const norm = ((deg % 360) + 360) % 360;
  const signIndex = Math.floor(norm / 30);
  const degInSign = norm - signIndex * 30;
  const degree = Math.floor(degInSign);
  const minutes = Math.round((degInSign - degree) * 60);
  let signName;
  if (language === 'Arabic') {
    signName = signsAr[signIndex];
  } else if (language === 'French') {
    signName = signsFr[signIndex];
  } else {
    signName = signsEn[signIndex];
  }
  return { signName, degree, minutes };
}

const translations = {
  Arabic: {
    aboutSection: '🌟 AstroHabibi هو رفيقك الودود في علم الفلك على التلغرام والواتساب.\n\nنحن نستخدم علم الفلك الغربي الاستوائي ونظام البيوت Placidus لحساب:\n• خريطتك الفلكية 🔭\n• عبور الكواكب اليومي 📊\n• النجوم الثابتة ✨\n• الكويكبات ☄️\n\nكل شيء مُوضح بلغة بسيطة وعملية—مثالي للعقول الفضولية والإرشاد العملي.\n\n👋 مرحباً، أنا نادية، منجمتك الشخصية.\nنحن نستخدم علم الفلك لتوقيت أفضل حياتنا ⏳✨\n"علم الفلك كمظلة تحمينا في الأوقات الممطرة" ☔🔮',
    continueButton: 'ابدأ رحلتي الفلكية ✨',
    dialectPrompt: '🗣️ اختر لهجتك العربية:',
    dayPrompt:     '📅 اختر يوم ميلادك:',
    monthPrompt:   '📅 اختر شهر ميلادك (1-12):',
    yearPrompt:    '📅 اختر سنة ميلادك:',
    hourPrompt:    '⏰ اختر ساعة الميلاد (0-23):',
    minutePrompt:  '⏰ اختر دقيقة الميلاد (0-59):',
    placePrompt:   '📍 ممتاز! وأخيراً، أدخل مكان ميلادك (مثال: نيويورك، الولايات المتحدة):',
    calculating:   '🔮 يتم الآن حساب خريطتك الفلكية والقراءة الروحية، يرجى الانتظار...',
    chartReady:    '✨ تم إنشاء خريطتك الفلكية! الآن سأقوم بإعداد التفسير الروحي المفصل، هذا قد يستغرق دقيقة واحدة...',
    interpretationIntro: '🔮 دعني أضع لك قراءة روحية مختصرة حسب موقع الكواكب والأبراج...',
    backLabel: '⬅️ رجوع',
    unknownTimeLabel: 'غير معروف',
    confirmPlacePrompt: '📌 اختر أقرب تطابق لبلدتك:',
    commands: {
      help: '📋 قائمة الأوامر المتاحة:\n\n/start - ابدأ إنشاء خريطتك الفلكية\n/about - معلومات عن AstroHabibi\n/natal_chart - عرض خريطتك الفلكية المحفوظة\n/asteroids - عرض الكويكبات في خريطتك\n/fixed_stars - عرض النجوم الثابتة في خريطتك\n/transit_asteroids - كويكبات العبور الحالية\n/transit_fixed_stars - النجوم الثابتة العابرة الحالية\n/help - عرض هذه القائمة',
      natalChartRetrieved: '📜 خريطتك الفلكية المحفوظة:',
      noChartFound: '❌ لم يتم العثور على خريطة فلكية. استخدم /start لإنشاء واحدة.',
      asteroids: '🪨 الكويكبات في خريطتك الفلكية:',
      fixedStars: '⭐ النجوم الثابتة في خريطتك الفلكية:',
      transitAsteroids: '🌍 كويكبات العبور الحالية:',
      transitFixedStars: '✨ النجوم الثابتة العابرة الحالية:'
    }
  },
  English: {
    aboutSection: '🌟 AstroHabibi is your friendly astrology companion on Telegram & WhatsApp.\n\nWe use Western tropical astrology and the Placidus house system to calculate:\n• Your natal chart 🔭\n• Today\'s planetary transits 📊\n• Fixed stars ✨\n• Asteroids ☄️\n\nAll explained in simple, everyday language—perfect for curious minds and casual guidance.\n\n👋 Hi, I\'m Celeste, your personal astrologer.\nWe use astrology to time our best lives ⏳✨\n"Astrology as an umbrella to shield us during rainy times" ☔🔮',
    continueButton: 'Start My Journey ✨',
    dialectPrompt:     '',
    dayPrompt:         '📅 Please choose your birth day:',
    monthPrompt:       '📅 Please choose your birth month (1-12):',
    yearPrompt:        '📅 Please choose your birth year:',
    hourPrompt:        '⏰ Please choose your birth hour (0-23):',
    minutePrompt:      '⏰ Please choose your birth minute (0-59):',
    placePrompt:       '📍 Great! Finally, enter your birth place (e.g. New York, United States):',
    calculating:       '🔮 Calculating your full chart and interpretation, please wait...',
    chartReady:        '✨ Your natal chart is ready! Now preparing your detailed spiritual interpretation, this may take a minute...',
    interpretationIntro:'🔮 Here’s a spiritual reading based on your planetary positions...',
    backLabel: '⬅️ Back',
    unknownTimeLabel: 'Unknown',
    confirmPlacePrompt: '📌 Please choose the best match for your birthplace:',
    commands: {
      help: '📋 Available Commands:\n\n/start - Create your natal chart\n/about - About AstroHabibi\n/natal_chart - View your saved natal chart\n/asteroids - View asteroids in your chart\n/fixed_stars - View fixed stars in your chart\n/transit_asteroids - Current transit asteroids\n/transit_fixed_stars - Current transit fixed stars\n/help - Show this command list',
      natalChartRetrieved: '📜 Your saved natal chart:',
      noChartFound: '❌ No natal chart found. Use /start to create one.',
      asteroids: '🪨 Asteroids in your natal chart:',
      fixedStars: '⭐ Fixed stars in your natal chart:',
      transitAsteroids: '🌍 Current transit asteroids:',
      transitFixedStars: '✨ Current transit fixed stars:'
    }
  },
  French: {
    aboutSection: '🌟 AstroHabibi est votre compagnon astrologique convivial sur Telegram et WhatsApp.\n\nNous utilisons l\'astrologie tropicale occidentale et le système de maisons Placidus pour calculer:\n• Votre thème natal 🔭\n• Les transits planétaires d\'aujourd\'hui 📊\n• Les étoiles fixes ✨\n• Les astéroïdes ☄️\n\nTout expliqué dans un langage simple et quotidien—parfait pour les esprits curieux et les conseils occasionnels.\n\n👋 Salut, je suis Céleste, votre astrologue personnelle.\nNous utilisons l\'astrologie pour chronométrer nos meilleures vies ⏳✨\n"L\'astrologie comme un parapluie pour nous protéger pendant les temps pluvieux" ☔🔮',
    continueButton: 'Commencer Mon Voyage ✨',
    dialectPrompt: '',
    dayPrompt: '📅 Veuillez choisir le jour de naissance:',
    monthPrompt: '📅 Veuillez choisir le mois de naissance (1-12):',
    yearPrompt: "📅 Veuillez choisir l'année de naissance:",
    hourPrompt: '⏰ Veuillez choisir l\'heure de naissance (0-23):',
    minutePrompt: '⏰ Veuillez choisir la minute de naissance (0-59):',
    placePrompt: '📍 Parfait ! Enfin, entrez votre lieu de naissance (ex: Paris, France):',
    calculating: '🔮 Calcul de votre carte du ciel et de l\'interprétation spirituelle en cours...',
    chartReady: '✨ Votre thème natal est prêt ! Préparation de votre interprétation spirituelle détaillée, cela peut prendre une minute...',
    interpretationIntro: '🔮 Voici une lecture spirituelle basée sur vos positions planétaires...',
    backLabel: '⬅️ Retour',
    unknownTimeLabel: 'Inconnu',
    confirmPlacePrompt: '📌 Choisissez le lieu correspondant :',
    commands: {
      help: '📋 Commandes disponibles:\n\n/start - Créer votre thème natal\n/about - À propos d\'AstroHabibi\n/natal_chart - Voir votre thème natal sauvegardé\n/asteroids - Voir les astéroïdes dans votre thème\n/fixed_stars - Voir les étoiles fixes dans votre thème\n/transit_asteroids - Astéroïdes en transit actuels\n/transit_fixed_stars - Étoiles fixes en transit actuelles\n/help - Afficher cette liste',
      natalChartRetrieved: '📜 Votre thème natal sauvegardé:',
      noChartFound: '❌ Aucun thème natal trouvé. Utilisez /start pour en créer un.',
      asteroids: '🪨 Astéroïdes dans votre thème natal:',
      fixedStars: '⭐ Étoiles fixes dans votre thème natal:',
      transitAsteroids: '🌍 Astéroïdes en transit actuels:',
      transitFixedStars: '✨ Étoiles fixes en transit actuelles:'
    }
  }
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in environment');
  process.exit(1);
}
const SERVICE_URL = process.env.SERVICE_URL;
if (!SERVICE_URL) {
  console.warn('⚠️ SERVICE_URL is not set in environment - webhook setup will be skipped');
}
console.log('🔑 Bot SERVICE_URL=', SERVICE_URL || 'not set');

// Create bot with appropriate mode based on how it's run
// Standalone: use polling for local testing
// Via index.js: use webhooks for production
const isStandalone = require.main === module;
const bot = isStandalone 
  ? new TelegramBot(BOT_TOKEN, { polling: true })
  : new TelegramBot(BOT_TOKEN);

if (isStandalone) {
  console.log('🔄 Running in standalone mode with polling (for local testing)');
} else {
  console.log('🪝 Running in webhook mode (via server)');
}

// Function to set up webhook (call this after server starts)
async function setupWebhook() {
  if (!SERVICE_URL) {
    console.warn('⚠️ Cannot set webhook - SERVICE_URL not configured');
    return;
  }
  
  const WEBHOOK_URL = `${SERVICE_URL}/webhook`;
  console.log('🪝 Setting webhook URL:', WEBHOOK_URL);
  
  try {
    // First, delete any existing webhook
    await bot.deleteWebHook();
    console.log('🗑️ Deleted existing webhook');
    
    // Wait a moment before setting new webhook
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Set the new webhook
    const result = await bot.setWebHook(WEBHOOK_URL);
    console.log('🪝 Webhook set result:', result);
    
    // Verify the webhook was set correctly
    const webhookInfo = await bot.getWebHookInfo();
    console.log('🔍 Webhook verification:', webhookInfo);
    
    if (webhookInfo.url === WEBHOOK_URL) {
      console.log('✅ Webhook set and verified successfully');
    } else {
      console.error('❌ Webhook verification failed - URL mismatch');
      console.error('Expected:', WEBHOOK_URL);
      console.error('Actual:', webhookInfo.url);
    }
    
    // Set up bot commands after webhook is configured
    await setupBotCommands();
    
  } catch (error) {
    console.error('❌ Failed to set webhook:', error.message);
    console.error('❌ Full error:', error);
  }
}

// Simple state storage (in-memory; replace with DB for production)
const userState = {};

// Handle /start command
async function handleStartCommand(msg) {
  const chatId = msg.chat.id;
  userState[chatId] = { step: 'language' };
  await bot.sendMessage(chatId, '🌐 Choose your language العربية | English | Français', {
    reply_markup: { 
      keyboard: [['العربية','English','Français']], 
      one_time_keyboard: false,  // Force keyboard to stay
      resize_keyboard: true
    }
  });
}

// Function to validate if input matches expected keyboard options
function isValidKeyboardInput(text, expectedOptions) {
  return expectedOptions.includes(text);
}

// Function to re-send keyboard when user types invalid input
async function forceKeyboard(chatId, currentStep, language) {
  const translations = {
    Arabic: { 
      invalidInput: '❌ يرجى اختيار أحد الخيارات من لوحة المفاتيح أدناه.',
      dayPrompt: '📅 اختر يوم ميلادك:',
      monthPrompt: '📅 اختر شهر ميلادك (1-12):',
      yearPrompt: '📅 اختر سنة ميلادك:',
      hourPrompt: '⏰ اختر ساعة الميلاد (0-23):',
      minutePrompt: '⏰ اختر دقيقة الميلاد (0-59):',
      backLabel: '⬅️ رجوع',
      unknownTimeLabel: 'غير معروف'
    },
    English: { 
      invalidInput: '❌ Please choose one of the options from the keyboard below.',
      dayPrompt: '📅 Please choose your birth day:',
      monthPrompt: '📅 Please choose your birth month (1-12):',
      yearPrompt: '📅 Please choose your birth year:',
      hourPrompt: '⏰ Please choose your birth hour (0-23):',
      minutePrompt: '⏰ Please choose your birth minute (0-59):',
      backLabel: '⬅️ Back',
      unknownTimeLabel: 'Unknown'
    },
    French: { 
      invalidInput: '❌ Veuillez choisir une option du clavier ci-dessous.',
      dayPrompt: '📅 Veuillez choisir le jour de naissance:',
      monthPrompt: '📅 Veuillez choisir le mois de naissance (1-12):',
      yearPrompt: "📅 Veuillez choisir l'année de naissance:",
      hourPrompt: '⏰ Veuillez choisir l\'heure de naissance (0-23):',
      minutePrompt: '⏰ Veuillez choisir la minute de naissance (0-59):',
      backLabel: '⬅️ Retour',
      unknownTimeLabel: 'Inconnu'
    }
  };

  const t = translations[language] || translations.English;

  switch (currentStep) {
    case 'language':
      await bot.sendMessage(chatId, '❌ Please choose a language from the keyboard: العربية | English | Français', {
        reply_markup: { 
          keyboard: [['العربية','English','Français']], 
          one_time_keyboard: false,
          resize_keyboard: true
        }
      });
      break;

    case 'birth-day':
      await bot.sendMessage(chatId, t.invalidInput + '\n\n' + t.dayPrompt, {
        reply_markup: {
          keyboard: [
            ['1','2','3','4','5','6','7'],
            ['8','9','10','11','12','13','14'],
            ['15','16','17','18','19','20','21'],
            ['22','23','24','25','26','27','28'],
            ['29','30','31'],
            [t.backLabel]
          ],
          one_time_keyboard: false,
          resize_keyboard: true
        }
      });
      break;

    case 'birth-month':
      await bot.sendMessage(chatId, t.invalidInput + '\n\n' + t.monthPrompt, {
        reply_markup: {
          keyboard: [
            ['1','2','3','4'],
            ['5','6','7','8'],
            ['9','10','11','12'],
            [t.backLabel]
          ],
          one_time_keyboard: false,
          resize_keyboard: true
        }
      });
      break;

    case 'birth-year':
      const years = [];
      const currentYear = new Date().getFullYear();
      for (let y = currentYear; y >= 1900; y--) {
        years.push(y.toString());
      }
      const yearRows = [];
      for (let i = 0; i < years.length; i += 4) {
        yearRows.push(years.slice(i, i + 4));
      }
      yearRows.push([t.backLabel]);
      
      await bot.sendMessage(chatId, t.invalidInput + '\n\n' + t.yearPrompt, {
        reply_markup: { keyboard: yearRows, one_time_keyboard: false, resize_keyboard: true }
      });
      break;

    case 'birth-hour':
      const hourRows = [];
      for (let start = 0; start < 24; start += 6) {
        const row = [];
        for (let h = start; h < start + 6; h++) {
          row.push(h.toString());
        }
        hourRows.push(row);
      }
      hourRows.push([t.unknownTimeLabel]);
      hourRows.push([t.backLabel]);
      
      await bot.sendMessage(chatId, t.invalidInput + '\n\n' + t.hourPrompt, {
        reply_markup: { keyboard: hourRows, one_time_keyboard: false, resize_keyboard: true }
      });
      break;

    case 'birth-minute':
      const minuteRows = [];
      for (let start = 0; start < 60; start += 10) {
        const row = [];
        for (let m = start; m < start + 10; m++) {
          row.push(m < 10 ? `0${m}` : `${m}`);
        }
        minuteRows.push(row);
      }
      minuteRows.push([t.unknownTimeLabel]);
      minuteRows.push([t.backLabel]);
      
      await bot.sendMessage(chatId, t.invalidInput + '\n\n' + t.minutePrompt, {
        reply_markup: { keyboard: minuteRows, one_time_keyboard: false, resize_keyboard: true }
      });
      break;

    case 'birth-place-confirm':
      // For place confirmation, we need to re-send the location options
      const state = userState[chatId];
      if (state && state.candidates) {
        const keyboardRows = state.candidates.map(place => [{ text: place.display_name }]);
        keyboardRows.push([t.backLabel]);
        
        const confirmPrompt = language === 'Arabic' ? '📌 اختر أقرب تطابق لبلدتك:' :
                             language === 'French' ? '📌 Choisissez le lieu correspondant :' :
                             '📌 Please choose the best match for your birthplace:';
        
        await bot.sendMessage(chatId, t.invalidInput + '\n\n' + confirmPrompt, {
          reply_markup: {
            keyboard: keyboardRows,
            one_time_keyboard: false,
            resize_keyboard: true
          }
        });
      }
      break;
  }
}

// Handle regular messages
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = userState[chatId];
  
  console.log(`🔍 [handleMessage] Called with text: "${text}", has state: ${!!state}, is command: ${text.startsWith('/')}`);
  
  // If no state and user isn't sending /start or other commands, prompt them to start
  if (!state && !text.startsWith('/')) {
    console.log(`🔍 [handleMessage] No state and not a command, sending start prompt`);
    return bot.sendMessage(chatId, 'Please use /start to begin creating your natal chart! 🌟');
  }

  try {
    // Handle Back button
    if (
      state.language &&
      (text === translations[state.language].backLabel)
    ) {
      if (state.step === 'birth-month') {
        state.step = 'birth-day';
        // Day keyboard with back
        return bot.sendMessage(chatId, translations[state.language].dayPrompt, {
          reply_markup: {
            keyboard: [
              ['1','2','3','4','5','6','7'],
              ['8','9','10','11','12','13','14'],
              ['15','16','17','18','19','20','21'],
              ['22','23','24','25','26','27','28'],
              ['29','30','31'],
              [translations[state.language].backLabel]
            ],
            one_time_keyboard: false
          }
        });
      }
      if (state.step === 'birth-year') {
        state.step = 'birth-month';
        // Month keyboard with back
        return bot.sendMessage(chatId, translations[state.language].monthPrompt, {
          reply_markup: {
            keyboard: [
              ['1','2','3','4'],
              ['5','6','7','8'],
              ['9','10','11','12'],
              [translations[state.language].backLabel]
            ],
            one_time_keyboard: true
          }
        });
      }
      if (state.step === 'birth-hour') {
        state.step = 'birth-year';
        // Years keyboard with back
        const years = [];
        const currentYear = new Date().getFullYear();
        for (let y = 1900; y <= currentYear; y++) {
          years.push(y.toString());
        }
        const yearRows = [];
        for (let i = 0; i < years.length; i += 3) {
          yearRows.push(years.slice(i, i + 3));
        }
        yearRows.push([translations[state.language].backLabel]);
        return bot.sendMessage(chatId, translations[state.language].yearPrompt, {
          reply_markup: { keyboard: yearRows, one_time_keyboard: false, resize_keyboard: true }
        });
      }
      if (state.step === 'birth-minute') {
        state.step = 'birth-hour';
        // Hours keyboard with unknown and back
        const hourRows = [];
        for (let start = 0; start < 24; start += 6) {
          const row = [];
          for (let h = start; h < start + 6; h++) {
            row.push(h.toString());
          }
          hourRows.push(row);
        }
        hourRows.push([translations[state.language].unknownTimeLabel]);
        hourRows.push([translations[state.language].backLabel]);
        return bot.sendMessage(chatId, translations[state.language].hourPrompt, {
          reply_markup: { keyboard: hourRows, one_time_keyboard: false, resize_keyboard: true }
        });
      }
      if (state.step === 'birth-place-text') {
        state.step = 'birth-minute';
        // Minutes keyboard with unknown and back
        const minuteRows = [];
        for (let start = 0; start < 60; start += 10) {
          const row = [];
          for (let m = start; m < start + 10; m++) {
            row.push(m < 10 ? `0${m}` : `${m}`);
          }
          minuteRows.push(row);
        }
        minuteRows.push([translations[state.language].unknownTimeLabel]);
        minuteRows.push([translations[state.language].backLabel]);
        return bot.sendMessage(chatId, translations[state.language].minutePrompt, {
          reply_markup: { keyboard: minuteRows, one_time_keyboard: false, resize_keyboard: true }
        });
      }
    }

    // Handle Unknown time
    if (
      state.language &&
      (text === translations[state.language].unknownTimeLabel)
    ) {
      if (state.step === 'birth-hour' || state.step === 'birth-minute') {
        // Set birthTime to null, skip minute, go to place text
        state.birthTime = null;
        // Map numeric month to English month name
        const monthNames = [
          'January','February','March','April','May','June',
          'July','August','September','October','November','December'
        ];
        const monthIndex = parseInt(state.birthMonth, 10) - 1;
        const monthName = monthNames[monthIndex] || state.birthMonth;
        state.birthDate = `${state.birthDay} ${monthName} ${state.birthYear}`;
        state.step = 'birth-place-text';
        return bot.sendMessage(chatId, translations[state.language].placePrompt, {
          reply_markup: { remove_keyboard: true }
        });
      }
    }

    if (state.step === 'language') {
      const validLanguages = ['العربية', 'English', 'Français'];
      
      if (!isValidKeyboardInput(text, validLanguages)) {
        return forceKeyboard(chatId, 'language', null);
      }
      
      if (text === 'العربية') {
        state.language = 'Arabic';
        state.dialect = 'MSA';
        state.step = 'about';
        return bot.sendMessage(chatId, translations.Arabic.aboutSection, {
          reply_markup: {
            keyboard: [[translations.Arabic.continueButton]],
            one_time_keyboard: false,
            resize_keyboard: true
          }
        });
      } else if (text === 'English') {
        state.language = 'English';
        state.dialect = 'English';
        state.step = 'about';
        return bot.sendMessage(chatId, translations.English.aboutSection, {
          reply_markup: {
            keyboard: [[translations.English.continueButton]],
            one_time_keyboard: false,
            resize_keyboard: true
          }
        });
      } else if (text === 'Français') {
        state.language = 'French';
        state.dialect = 'French';
        state.step = 'about';
        return bot.sendMessage(chatId, translations.French.aboutSection, {
          reply_markup: {
            keyboard: [[translations.French.continueButton]],
            one_time_keyboard: false,
            resize_keyboard: true
          }
        });
      }
    }

    // Handle About section continuation
    if (state.step === 'about') {
      const t = translations[state.language] || translations.English;
      
      if (text === t.continueButton) {
        state.step = 'birth-day';
        return bot.sendMessage(chatId, t.dayPrompt, {
          reply_markup: {
            keyboard: [
              ['1','2','3','4','5','6','7'],
              ['8','9','10','11','12','13','14'],
              ['15','16','17','18','19','20','21'],
              ['22','23','24','25','26','27','28'],
              ['29','30','31'],
              [t.backLabel]
            ],
            one_time_keyboard: false,
            resize_keyboard: true
          }
        });
      } else {
        // Invalid input - force keyboard
        return forceKeyboard(chatId, 'language', null);
      }
    }

    // Handle birth day selection
    if (state.step === 'birth-day') {
      const validDays = Array.from({length: 31}, (_, i) => (i + 1).toString());
      validDays.push(translations[state.language].backLabel);
      
      if (!isValidKeyboardInput(text, validDays)) {
        return forceKeyboard(chatId, 'birth-day', state.language);
      }
      
      if (text === translations[state.language].backLabel) {
        // Go back to language selection
        state.step = 'language';
        return bot.sendMessage(chatId, '🌐 Choose your language العربية | English | Français', {
          reply_markup: { 
            keyboard: [['العربية','English','Français']], 
            one_time_keyboard: false,
            resize_keyboard: true
          }
        });
      }
      
      state.birthDay = text;
      state.step = 'birth-month';
      return bot.sendMessage(chatId, translations[state.language].monthPrompt, {
        reply_markup: {
          keyboard: [
            ['1','2','3','4'],
            ['5','6','7','8'],
            ['9','10','11','12'],
            [translations[state.language].backLabel]
          ],
          one_time_keyboard: false,
          resize_keyboard: true
        }
      });
    }

    // Handle birth month selection
    if (state.step === 'birth-month') {
      const validMonths = Array.from({length: 12}, (_, i) => (i + 1).toString());
      validMonths.push(translations[state.language].backLabel);
      
      if (!isValidKeyboardInput(text, validMonths)) {
        return forceKeyboard(chatId, 'birth-month', state.language);
      }
      
      if (text === translations[state.language].backLabel) {
        // Go back to birth-day
        state.step = 'birth-day';
        return bot.sendMessage(chatId, translations[state.language].dayPrompt, {
          reply_markup: {
            keyboard: [
              ['1','2','3','4','5','6','7'],
              ['8','9','10','11','12','13','14'],
              ['15','16','17','18','19','20','21'],
              ['22','23','24','25','26','27','28'],
              ['29','30','31'],
              [translations[state.language].backLabel]
            ],
            one_time_keyboard: false,
            resize_keyboard: true
          }
        });
      }
      
      state.birthMonth = text;
      state.step = 'birth-year';
      const years = [];
      const currentYear = new Date().getFullYear();
      for (let y = currentYear; y >= 1900; y--) {
        years.push(y.toString());
      }
      const yearRows = [];
      for (let i = 0; i < years.length; i += 4) {
        yearRows.push(years.slice(i, i + 4));
      }
      yearRows.push([translations[state.language].backLabel]);
      return bot.sendMessage(chatId, translations[state.language].yearPrompt, {
        reply_markup: {
          keyboard: yearRows,
          resize_keyboard: true,
          one_time_keyboard: false
        }
      });
    }

    // Handle birth year selection
    if (state.step === 'birth-year') {
      const currentYear = new Date().getFullYear();
      const validYears = [];
      for (let y = currentYear; y >= 1900; y--) {
        validYears.push(y.toString());
      }
      validYears.push(translations[state.language].backLabel);
      
      if (!isValidKeyboardInput(text, validYears)) {
        return forceKeyboard(chatId, 'birth-year', state.language);
      }
      
      if (text === translations[state.language].backLabel) {
        // Go back to birth-month
        state.step = 'birth-month';
        return bot.sendMessage(chatId, translations[state.language].monthPrompt, {
          reply_markup: {
            keyboard: [
              ['1','2','3','4'],
              ['5','6','7','8'],
              ['9','10','11','12'],
              [translations[state.language].backLabel]
            ],
            one_time_keyboard: false,
            resize_keyboard: true
          }
        });
      }
      
      state.birthYear = text;
      
      // Send important birth time message in user's language
      const timeImportanceMessage = state.language === 'Arabic' 
        ? `⚠️ *مهم جداً:* الوقت الدقيق للولادة ضروري لحساب البيوت الفلكية والطالع.\n\n📍 إذا كنت متأكداً من الوقت، اختر الساعة الصحيحة.\n🤷‍♀️ إذا لم تكن متأكداً، اضغط على "غير معروف".\n\nهذا يؤثر بشكل كبير على دقة التفسير الفلكي.`
        : state.language === 'French'
        ? `⚠️ *Très important :* L'heure exacte de naissance est cruciale pour calculer les maisons astrologiques et l'ascendant.\n\n📍 Si vous êtes sûr de l'heure, choisissez l'heure correcte.\n🤷‍♀️ Si vous n'êtes pas sûr, cliquez sur "Inconnu".\n\nCela affecte grandement la précision de l'interprétation astrologique.`
        : `⚠️ *Very Important:* Exact birth time is crucial for calculating astrological houses and ascendant.\n\n📍 If you're certain of the time, select the correct hour.\n🤷‍♀️ If you're uncertain, click "Unknown".\n\nThis greatly affects the accuracy of your astrological interpretation.`;
      
      await bot.sendMessage(chatId, timeImportanceMessage, { parse_mode: 'Markdown' });
      
      state.step = 'birth-hour';
      const hourRows = [];
      for (let start = 0; start < 24; start += 6) {
        const row = [];
        for (let h = start; h < start + 6; h++) {
          row.push(h.toString());
        }
        hourRows.push(row);
      }
      hourRows.push([translations[state.language].unknownTimeLabel]);
      hourRows.push([translations[state.language].backLabel]);
      return bot.sendMessage(chatId, translations[state.language].hourPrompt, {
        reply_markup: { keyboard: hourRows, one_time_keyboard: false, resize_keyboard: true }
      });
    }

    // Handle birth hour selection
    if (state.step === 'birth-hour') {
      const validHours = Array.from({length: 24}, (_, i) => i.toString());
      validHours.push(translations[state.language].unknownTimeLabel);
      validHours.push(translations[state.language].backLabel);
      
      if (!isValidKeyboardInput(text, validHours)) {
        return forceKeyboard(chatId, 'birth-hour', state.language);
      }
      
      if (text === translations[state.language].backLabel) {
        // Go back to birth-year
        state.step = 'birth-year';
        const years = [];
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= 1900; y--) {
          years.push(y.toString());
        }
        const yearRows = [];
        for (let i = 0; i < years.length; i += 4) {
          yearRows.push(years.slice(i, i + 4));
        }
        yearRows.push([translations[state.language].backLabel]);
        return bot.sendMessage(chatId, translations[state.language].yearPrompt, {
          reply_markup: { keyboard: yearRows, one_time_keyboard: false, resize_keyboard: true }
        });
      }
      
      state.birthHour = text;
      state.step = 'birth-minute';
      const minuteRows = [];
      for (let start = 0; start < 60; start += 10) {
        const row = [];
        for (let m = start; m < start + 10; m++) {
          row.push(m < 10 ? `0${m}` : `${m}`);
        }
        minuteRows.push(row);
      }
      minuteRows.push([translations[state.language].unknownTimeLabel]);
      minuteRows.push([translations[state.language].backLabel]);
      return bot.sendMessage(chatId, translations[state.language].minutePrompt, {
        reply_markup: {
          keyboard: minuteRows,
          one_time_keyboard: false,
          resize_keyboard: true
        }
      });
    }

    // Handle birth minute selection
    if (state.step === 'birth-minute') {
      const validMinutes = [];
      for (let m = 0; m < 60; m++) {
        validMinutes.push(m < 10 ? `0${m}` : `${m}`);
      }
      validMinutes.push(translations[state.language].unknownTimeLabel);
      validMinutes.push(translations[state.language].backLabel);
      
      if (!isValidKeyboardInput(text, validMinutes)) {
        return forceKeyboard(chatId, 'birth-minute', state.language);
      }
      
      if (text === translations[state.language].backLabel) {
        // Go back to birth-hour
        state.step = 'birth-hour';
        const hourRows = [];
        for (let start = 0; start < 24; start += 6) {
          const row = [];
          for (let h = start; h < start + 6; h++) {
            row.push(h.toString());
          }
          hourRows.push(row);
        }
        hourRows.push([translations[state.language].unknownTimeLabel]);
        hourRows.push([translations[state.language].backLabel]);
        return bot.sendMessage(chatId, translations[state.language].hourPrompt, {
          reply_markup: { keyboard: hourRows, one_time_keyboard: false, resize_keyboard: true }
        });
      }
      
      state.birthMinute = text;
      // Map numeric month to English month name
      const monthNames = [
        'January','February','March','April','May','June',
        'July','August','September','October','November','December'
      ];
      const monthIndex = parseInt(state.birthMonth, 10) - 1;
      const monthName = monthNames[monthIndex] || state.birthMonth;

      state.birthDate = `${state.birthDay} ${monthName} ${state.birthYear}`;

      // Convert 24-hour input to 12-hour format with AM/PM for birthTime
      let hr = parseInt(state.birthHour, 10);
      let ampm = 'AM';
      if (hr === 0) {
        hr = 12;
        ampm = 'AM';
      } else if (hr === 12) {
        ampm = 'PM';
      } else if (hr > 12) {
        hr = hr - 12;
        ampm = 'PM';
      }
      const minuteStr = state.birthMinute.padStart(2, '0');
      state.birthTime = `${hr}:${minuteStr} ${ampm}`;

      // Now ask user to type their birthplace
      state.step = 'birth-place-text';
      const promptText = translations[state.language].placePrompt;
      return bot.sendMessage(chatId, promptText, {
        reply_markup: { remove_keyboard: true }
      });
    }

    // Handle free-text birthplace entry
    if (state.step === 'birth-place-text') {
      if (text === translations[state.language].backLabel) {
        // handled above
        return;
      }
      const rawPlaceQuery = text;
      let geoResults;
      try {
        // Map user language to appropriate locale codes for geocoding
        const languageCode = state.language === 'Arabic' ? 'ar' : 
                            state.language === 'French' ? 'fr' : 'en';
        
        const geoRes = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { 
            q: rawPlaceQuery, 
            format: 'json', 
            limit: 5,
            'accept-language': languageCode
          },
          headers: {
            'User-Agent': 'AstroHabibi-Bot/1.0 (https://astrohabibi.com; contact@astrohabibi.com)',
            'Accept-Language': languageCode
          }
        });
        geoResults = geoRes.data;
      } catch (err) {
        console.error('✖ Geocoding error:', err);
        return bot.sendMessage(chatId,
          state.language === 'Arabic'
            ? '❌ فشل في البحث عن المكان. حاول مرة أخرى.'
            : state.language === 'French'
              ? '❌ Échec de la géolocalisation. Veuillez réessayer.'
              : '❌ Failed to look up that place. Please try again.'
        );
      }

      if (!Array.isArray(geoResults) || geoResults.length === 0) {
        return bot.sendMessage(chatId,
          state.language === 'Arabic'
            ? '❓ لم أجد أي مكان مطابق. حاول كتابة اسم آخر.'
            : state.language === 'French'
              ? '❓ Aucun lieu trouvé. Veuillez réessayer.'
              : '❓ No matching places found. Please try different spelling.'
        );
      }

      state.candidates = geoResults;
      state.step = 'birth-place-confirm';

      // Build keyboard rows of display_name with back button
      const keyboardRows = geoResults.map(place => [{ text: place.display_name }]);
      keyboardRows.push([translations[state.language].backLabel]);
      return bot.sendMessage(
        chatId,
        translations[state.language].confirmPlacePrompt,
        {
          reply_markup: {
            keyboard: keyboardRows,
            one_time_keyboard: false,
            resize_keyboard: true
          }
        }
      );
    }

    // Handle selection of a geocoded birthplace
    if (state.step === 'birth-place-confirm') {
      // Build valid options list: all place display names + back button
      const validPlaceOptions = (state.candidates || []).map(c => c.display_name);
      validPlaceOptions.push(translations[state.language].backLabel);
      
      if (!isValidKeyboardInput(text, validPlaceOptions)) {
        return forceKeyboard(chatId, 'birth-place-confirm', state.language);
      }
      
      if (text === translations[state.language].backLabel) {
        // Go back to birth-place-text
        state.step = 'birth-place-text';
        return bot.sendMessage(chatId, translations[state.language].placePrompt, {
          reply_markup: { remove_keyboard: true }
        });
      }
      
      const chosenText = text;
      const found = (state.candidates || []).find(c => c.display_name === chosenText);
      if (!found) {
        return forceKeyboard(chatId, 'birth-place-confirm', state.language);
      }

      state.birthLat = parseFloat(found.lat);
      state.birthLon = parseFloat(found.lon);
      state.birthPlaceName = found.display_name;

      await bot.sendMessage(chatId, translations[state.language].calculating);

      const platformKey = `telegram-${chatId}`;
      const payload = {
        userId:       platformKey,
        birthDate:    state.birthDate,
        birthTime:    state.birthTime,
        birthPlace:   state.birthPlaceName,
        latitude:     state.birthLat,
        longitude:    state.birthLon,
        dialect:      state.language === 'Arabic' ? 'MSA' : state.language,
        withInterpretation: false  // Get chart only, no interpretation yet
      };

      let chartRes;
      try {
        chartRes = await axios.post(`${SERVICE_URL}/full-chart`, payload);
      } catch (err) {
        console.error('✖ /full-chart error:', err);
        return bot.sendMessage(chatId,
          state.language === 'Arabic'
            ? '❌ فشل في حساب خريطتك. حاول مرة أخرى لاحقًا.'
            : state.language === 'French'
              ? '❌ Échec du calcul de votre carte. Veuillez réessayer plus tard.'
              : '❌ Failed to calculate your chart. Please try again later.'
        );
      }

      // Send chart summary immediately while interpretation is being calculated
      await bot.sendMessage(
        chatId,
        formatChartSummary(chartRes.data, state.language),
        { parse_mode: 'Markdown' }
      );
      
      // Save in-memory for follow-ups and load persistent conversation history
      state.lastChart = chartRes.data;
      
      // Load persistent conversation history for this user
      try {
        state.conversationHistory = await getConversationHistory(platformKey, 20, 30);
        console.log(`💬 Loaded ${state.conversationHistory.length} previous messages for user`);
      } catch (error) {
        console.warn('⚠️ Could not load conversation history (likely credentials issue):', error.message);
        state.conversationHistory = []; // Fallback to empty history
        console.log('📝 Using empty conversation history for this session');
      }
      
      // Also store the aspects list for reference in follow-up questions
      if (chartRes.data.planets) {
        const { findAllAspects } = require('./utils/interpreter');
        const allAspects = findAllAspects(chartRes.data.planets);
        state.lastAspects = allAspects;
        console.log('💾 Stored', allAspects.length, 'aspects for follow-up questions');
      }

      // Send "please wait" message before interpretation and start interpretation in parallel
      await bot.sendMessage(chatId, translations[state.language].chartReady);

      await bot.sendChatAction(chatId, 'typing');
      try {
        // Initialize conversation history for natal chart interpretation
        if (!state.conversationHistory) {
          state.conversationHistory = [];
        }
        
        console.log('🔍 Making interpret request with:', {
          SERVICE_URL,
          userId: platformKey,
          dialect: state.language === 'Arabic' ? 'MSA' : state.language,
          url: `${SERVICE_URL}/interpret`
        });
        
        const requestPayload = {
          userId: platformKey,
          question: 'Please provide a spiritual interpretation of my natal chart.',
          dialect: state.language === 'Arabic' ? 'MSA' : state.language,
          conversationHistory: state.conversationHistory
        };
        
        console.log('🔍 Request payload:', {
          ...requestPayload,
          conversationHistoryLength: requestPayload.conversationHistory?.length || 0
        });
        
        const interpResp = await axios.post(`${SERVICE_URL}/interpret`, requestPayload);
        
        console.log('✅ Interpret response received:', {
          hasAnswer: !!interpResp.data.answer,
          answerLength: interpResp.data.answer?.length
        });
        const fullText = interpResp.data.answer || '';
        
        // Save the natal chart interpretation to persistent conversation history
        try {
          const chartId = state.lastChart?.chartId || `telegram-${chatId}-${Date.now()}`;
          
          await saveConversationMessage(
            platformKey, 
            'user', 
            'Please provide a spiritual interpretation of my natal chart.',
            { type: 'natal_chart_request', chartId: chartId }
          );
          
          await saveConversationMessage(
            platformKey, 
            'assistant', 
            fullText,
            { type: 'natal_chart_interpretation', chartId: chartId }
          );
          
          // Also update in-memory for current session
          state.conversationHistory.push({
            role: 'user',
            content: 'Please provide a spiritual interpretation of my natal chart.',
            timestamp: new Date()
          });
          
          state.conversationHistory.push({
            role: 'assistant',
            content: fullText,
            timestamp: new Date()
          });
          
          console.log('💾 Saved natal chart interpretation to persistent conversation history');
        } catch (error) {
          console.error('❌ Failed to save conversation to Firestore:', error.message);
        }
        
        let idx = 0, maxLen = 4000;
        while (idx < fullText.length) {
          let endIdx = Math.min(idx + maxLen, fullText.length);
          if (endIdx < fullText.length) {
            const slice = fullText.slice(idx, endIdx);
            const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
            if (cut > -1) endIdx = idx + cut;
          }
          const chunk = fullText.slice(idx, endIdx);
          await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
          idx = endIdx;
        }
      } catch (interpErr) {
        console.error('✖ Interpretation error:', interpErr);
        console.error('✖ Interpretation error details:', {
          message: interpErr.message,
          response: interpErr.response?.data,
          status: interpErr.response?.status,
          url: `${SERVICE_URL}/interpret`
        });
        await bot.sendMessage(chatId,
          state.language === 'Arabic'
            ? '❌ حدث خطأ أثناء جلب التفسير. حاول مرة أخرى لاحقًا.'
            : state.language === 'French'
              ? '❌ Une erreur est survenue lors de l’interprétation. Réessayez plus tard.'
              : '❌ Failed to fetch interpretation. Please try again later.'
        );
      }

      // Mark complete only _after_ sending all responses
      state.step = 'done';
      return;
    }
  } catch (err) {
    console.error('Bot error:', err);
    try {
      bot.sendMessage(chatId, '❌ Oops, something went wrong. Please try again later.');
    } catch (sendErr) {
      console.error('Failed to send error message:', sendErr);
    }
  }
}


function formatChartSummary(data, language = 'English') {
  const isAr = language === 'Arabic';
  const isFr = language === 'French';
  const lines = [];

  const planetTranslations = {
    English: {
      SUN: 'SUN', MOON: 'MOON', MERCURY: 'MERCURY', VENUS: 'VENUS',
      MARS: 'MARS', JUPITER: 'JUPITER', SATURN: 'SATURN',
      URANUS: 'URANUS', NEPTUNE: 'NEPTUNE', PLUTO: 'PLUTO',
      'NORTH NODE': 'NORTH NODE', LILITH: 'LILITH',
      // Asteroids
      CERES: 'CERES', PALLAS: 'PALLAS', JUNO: 'JUNO', VESTA: 'VESTA',
      CHIRON: 'CHIRON', PSYCHE: 'PSYCHE', HYGEIA: 'HYGEIA',
      // Fixed Stars
      REGULUS: 'REGULUS', SPICA: 'SPICA', ARCTURUS: 'ARCTURUS',
      ANTARES: 'ANTARES', VEGA: 'VEGA', SIRIUS: 'SIRIUS',
      ALDEBARAN: 'ALDEBARAN', BETELGEUSE: 'BETELGEUSE', RIGEL: 'RIGEL', ALGOL: 'ALGOL'
    },
    Arabic: {
      SUN: 'الشمس', MOON: 'القمر', MERCURY: 'عطارد', VENUS: 'الزهرة',
      MARS: 'المريخ', JUPITER: 'المشتري', SATURN: 'زحل',
      URANUS: 'أورانوس', NEPTUNE: 'نبتون', PLUTO: 'بلوتو',
      'NORTH NODE': 'عقدة الشمال', LILITH: 'ليليث',
      // Asteroids
      CERES: 'سيريس', PALLAS: 'بالاس', JUNO: 'جونو', VESTA: 'فستا',
      CHIRON: 'خيرون', PSYCHE: 'بسايكي', HYGEIA: 'هيجيا',
      // Fixed Stars
      REGULUS: 'ريجولوس', SPICA: 'السنبلة', ARCTURUS: 'ذؤاب الدبران',
      ANTARES: 'قلب العقرب', VEGA: 'النسر الواقع', SIRIUS: 'الشعرى',
      ALDEBARAN: 'الدبران', BETELGEUSE: 'منكب الجوزاء', RIGEL: 'الرجل', ALGOL: 'رأس الغول'
    },
    French: {
      SUN: 'SOLEIL', MOON: 'LUNE', MERCURY: 'MERCURE', VENUS: 'VENUS',
      MARS: 'MARS', JUPITER: 'JUPITER', SATURN: 'SATURNE',
      URANUS: 'URANUS', NEPTUNE: 'NEPTUNE', PLUTO: 'PLUTON',
      'NORTH NODE': 'NŒUD NORD', LILITH: 'LILITH',
      // Asteroids
      CERES: 'CÉRÈS', PALLAS: 'PALLAS', JUNO: 'JUNON', VESTA: 'VESTA',
      CHIRON: 'CHIRON', PSYCHE: 'PSYCHÉ', HYGEIA: 'HYGIE',
      // Fixed Stars
      REGULUS: 'RÉGULUS', SPICA: 'SPICA', ARCTURUS: 'ARCTURUS',
      ANTARES: 'ANTARÈS', VEGA: 'VÉGA', SIRIUS: 'SIRIUS',
      ALDEBARAN: 'ALDÉBARAN', BETELGEUSE: 'BÉTELGEUSE', RIGEL: 'RIGEL', ALGOL: 'ALGOL'
    }
  };

  const title = isAr
    ? '📜 مخططك الفلكي'
    : isFr
    ? '📜 Votre carte du ciel'
    : '📜 Your Birth Chart';
  lines.push(title);

  // Ascendant
  if (typeof data.ascendant === 'number') {
    const asc = degreeToSignDetails(data.ascendant, language);
    const ascLabel = isAr
      ? 'الطالع'
      : isFr
      ? 'Ascendant'
      : 'Ascendant';
    lines.push(`• ${ascLabel}: \`${asc.signName} ${asc.degree}°${asc.minutes}′\``);
  }

  // Houses
  const housesLabel = isAr
    ? 'البيوت'
    : isFr
    ? 'Maisons'
    : 'Houses';
  if (Array.isArray(data.houses)) {
    lines.push(`• ${housesLabel}:`);
    data.houses.forEach((h, i) => {
      // h is a numeric degree for the cusp of house i+1
      const hDet = degreeToSignDetails(h, language);
      const houseNumber = i + 1;
      const houseLabel = isAr
        ? `البيت ${houseNumber}`
        : isFr
        ? `Maison ${houseNumber}`
        : `House ${houseNumber}`;
      lines.push(`  - ${houseLabel}: \`${hDet.signName} ${hDet.degree}°${hDet.minutes}′\``);
    });
  }

  // Group planets by type for better organization
  if (Array.isArray(data.planets)) {
    const planets = data.planets.filter(p => !p.type || p.type === 'planet');
    const asteroids = data.planets.filter(p => p.type === 'asteroid');
    const fixedStars = data.planets.filter(p => p.type === 'fixed_star');

    // Main Planets
    const planetLabel = isAr ? 'الكواكب' : isFr ? 'Planètes' : 'Planets';
    if (planets.length > 0) {
      lines.push(`• ${planetLabel}:`);
      planets.forEach(p => {
        const pDet = degreeToSignDetails(p.longitude, language);
        const translatedName = planetTranslations[language][p.name] || p.name;
        const pLabel = isAr
          ? `${translatedName} في ${pDet.signName}`
          : isFr
          ? `${translatedName} en ${pDet.signName}`
          : `${translatedName} in ${pDet.signName}`;
        let retroMarker = '';
        if (p.retrograde) {
          retroMarker = language === 'Arabic' ? ' (رجعي)' : ' (R)';
        }
        lines.push(`  - ${pLabel} ${pDet.degree}°${pDet.minutes}′${retroMarker}`);
      });
    }

    // Asteroids
    const asteroidLabel = isAr ? 'الكويكبات' : isFr ? 'Astéroïdes' : 'Asteroids';
    if (asteroids.length > 0) {
      lines.push(`• ${asteroidLabel}:`);
      asteroids.forEach(p => {
        const pDet = degreeToSignDetails(p.longitude, language);
        const translatedName = planetTranslations[language][p.name] || p.name;
        const pLabel = isAr
          ? `${translatedName} في ${pDet.signName}`
          : isFr
          ? `${translatedName} en ${pDet.signName}`
          : `${translatedName} in ${pDet.signName}`;
        let retroMarker = '';
        if (p.retrograde) {
          retroMarker = language === 'Arabic' ? ' (رجعي)' : ' (R)';
        }
        lines.push(`  - 🪨 ${pLabel} ${pDet.degree}°${pDet.minutes}′${retroMarker}`);
      });
    }

    // Fixed Stars (only show if in tight aspect)
    const starLabel = isAr ? 'النجوم الثابتة' : isFr ? 'Étoiles fixes' : 'Fixed Stars';
    if (fixedStars.length > 0) {
      lines.push(`• ${starLabel}:`);
      fixedStars.forEach(p => {
        const pDet = degreeToSignDetails(p.longitude, language);
        const translatedName = planetTranslations[language][p.name] || p.name;
        const pLabel = isAr
          ? `${translatedName} في ${pDet.signName}`
          : isFr
          ? `${translatedName} en ${pDet.signName}`
          : `${translatedName} in ${pDet.signName}`;
        lines.push(`  - ⭐ ${pLabel} ${pDet.degree}°${pDet.minutes}′`);
      });
    }
  }

  return lines.join('\n');
}

function formatFullInterpretation(data) {
  return data.interpretation;
}

// Helper to format the transit chart as a user-friendly list
function formatTransitChart(transits, language) {
  if (!Array.isArray(transits) || transits.length === 0) {
    return language === 'Arabic'
      ? '❓ لا توجد بيانات عبور متاحة حالياً.'
      : language === 'French'
      ? '❓ Aucune donnée de transit disponible pour le moment.'
      : '❓ No transit data available.';
  }
  
  const lines = [];
  const title =
    language === 'Arabic'
      ? '📊 خريطة العبور الحالية'
      : language === 'French'
      ? '📊 Carte des transits actuels'
      : '📊 Current Transits:';
  lines.push(title);
  
  transits.forEach(t => {
    // Safety check for transit object properties
    if (!t || typeof t.currentLongitude !== 'number' || !t.name) {
      console.log('⚠️ Invalid transit object:', t);
      return;
    }
    
    try {
      const det = degreeToSignDetails(t.currentLongitude, language);
      const retro =
        t.retrograde
          ? language === 'Arabic'
            ? ' (رجعي)'
            : ' (R)'
          : '';
      const signName = det.signName;
      lines.push(
        `• ${t.name}: \`${signName} ${det.degree}°${det.minutes}′${retro}\``
      );
    } catch (err) {
      console.error('Error formatting transit:', t, err);
    }
  });
  
  return lines.join('\n');
}


// Main webhook update handler
// Handle /natal_chart command
async function handleNatalChartCommand(chatId, platformKey, t, userLanguage) {
  try {
    const latest = await getLatestChart(platformKey);
    if (!latest) {
      await bot.sendMessage(chatId, t.commands.noChartFound);
      return;
    }
    
    const chartData = latest.rawChartData || latest;
    const formattedChart = formatChartSummary(chartData, t);
    await bot.sendMessage(chatId, `${t.commands.natalChartRetrieved}\n\n${formattedChart}`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Error retrieving natal chart:', error);
    await bot.sendMessage(chatId, t.commands.noChartFound);
  }
}

// Handle /asteroids command
async function handleAsteroidsCommand(chatId, platformKey, t, userLanguage) {
  try {
    const latest = await getLatestChart(platformKey);
    if (!latest) {
      await bot.sendMessage(chatId, t.commands.noChartFound);
      return;
    }
    
    const chartData = latest.rawChartData || latest;
    const asteroids = chartData.planets?.filter(p => p.type === 'asteroid') || [];
    
    if (asteroids.length === 0) {
      await bot.sendMessage(chatId, '❌ No asteroids found in your chart.');
      return;
    }
    
    let asteroidsText = `${t.commands.asteroids}\n\n`;
    asteroids.forEach(asteroid => {
      const details = degreeToSignDetails(asteroid.longitude, userLanguage);
      const retrograde = asteroid.retrograde ? ' (R)' : '';
      asteroidsText += `🪨 *${asteroid.name}* in ${details.signName} ${details.degree}°${details.minutes}′${retrograde}\n`;
    });
    
    await bot.sendMessage(chatId, asteroidsText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Error retrieving asteroids:', error);
    await bot.sendMessage(chatId, t.commands.noChartFound);
  }
}

// Handle /fixed_stars command
async function handleFixedStarsCommand(chatId, platformKey, t, userLanguage) {
  try {
    const latest = await getLatestChart(platformKey);
    if (!latest) {
      await bot.sendMessage(chatId, t.commands.noChartFound);
      return;
    }
    
    const chartData = latest.rawChartData || latest;
    const fixedStars = chartData.planets?.filter(p => p.type === 'fixed_star') || [];
    
    if (fixedStars.length === 0) {
      await bot.sendMessage(chatId, '❌ No fixed stars found in your chart.');
      return;
    }
    
    let starsText = `${t.commands.fixedStars}\n\n`;
    fixedStars.forEach(star => {
      const details = degreeToSignDetails(star.longitude, userLanguage);
      starsText += `⭐ *${star.name}* in ${details.signName} ${details.degree}°${details.minutes}′\n`;
    });
    
    await bot.sendMessage(chatId, starsText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Error retrieving fixed stars:', error);
    await bot.sendMessage(chatId, t.commands.noChartFound);
  }
}

// Handle /transit_asteroids command
async function handleTransitAsteroidsCommand(chatId, platformKey, t, userLanguage) {
  try {
    const latest = await getLatestChart(platformKey);
    if (!latest) {
      await bot.sendMessage(chatId, t.commands.noChartFound);
      return;
    }
    
    const chartData = latest.rawChartData || latest;
    
    // Get current transits (this will include transit asteroids)
    const { getLiveTransits } = require('./utils/transitCalculator');
    const allTransits = await getLiveTransits(chartData);
    const transitAsteroids = allTransits.filter(t => ['CERES', 'PALLAS', 'JUNO', 'VESTA', 'CHIRON', 'PSYCHE', 'HYGEIA'].includes(t.name));
    
    if (transitAsteroids.length === 0) {
      await bot.sendMessage(chatId, '❌ No transit asteroids available.');
      return;
    }
    
    let transitsText = `${t.commands.transitAsteroids}\n\n`;
    transitAsteroids.forEach(transit => {
      const retrograde = transit.retrograde ? ' (R)' : '';
      transitsText += `🌍 *${transit.name}* in ${transit.currentSign} ${transit.degree}°${transit.minutes}′${retrograde} (House ${transit.currentHouse})\n`;
    });
    
    await bot.sendMessage(chatId, transitsText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Error retrieving transit asteroids:', error);
    await bot.sendMessage(chatId, '❌ Unable to calculate current transits.');
  }
}

// Handle /transit_fixed_stars command
async function handleTransitFixedStarsCommand(chatId, platformKey, t, userLanguage) {
  try {
    const latest = await getLatestChart(platformKey);
    if (!latest) {
      await bot.sendMessage(chatId, t.commands.noChartFound);
      return;
    }
    
    const chartData = latest.rawChartData || latest;
    
    // Get current transits (this will include transit fixed stars)
    const { getLiveTransits } = require('./utils/transitCalculator');
    const allTransits = await getLiveTransits(chartData);
    const transitFixedStars = allTransits.filter(t => t.type === 'fixed_star');
    
    if (transitFixedStars.length === 0) {
      await bot.sendMessage(chatId, '❌ No transit fixed stars available.');
      return;
    }
    
    let transitsText = `${t.commands.transitFixedStars}\n\n`;
    transitFixedStars.forEach(transit => {
      const details = degreeToSignDetails(transit.currentLongitude, userLanguage);
      transitsText += `✨ *${transit.name}* in ${details.signName} ${details.degree}°${details.minutes}′ (House ${transit.currentHouse})\n`;
    });
    
    await bot.sendMessage(chatId, transitsText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Error retrieving transit fixed stars:', error);
    await bot.sendMessage(chatId, '❌ Unable to calculate current transit fixed stars.');
  }
}

// Handle /about command
async function handleAboutCommand(chatId, platformKey, t, userLanguage) {
  const aboutWithCommands = `${t.aboutSection}\n\n${t.commands.help}`;
  await bot.sendMessage(chatId, aboutWithCommands);
}

// Handle bot commands
async function handleCommands(msg) {
  const chatId = msg.chat.id;
  const command = msg.text.split(' ')[0].toLowerCase();
  const platformKey = `telegram-${chatId}`;
  
  console.log(`🔍 [handleCommands] Processing command: "${command}" from chat ${chatId}`);
  
  // Get user's language preference
  const state = userState[chatId];
  const userLanguage = state?.language || 'English';
  const t = translations[userLanguage] || translations.English;
  
  console.log(`🔍 [handleCommands] User language: ${userLanguage}, has state: ${!!state}`);
  
  // Reset user state if they're stuck in a broken state (emergency reset)
  if (command === '/start' && state) {
    console.log(`🔄 [handleCommands] Resetting user state for /start command`);
    delete userState[chatId];
  }
  
  try {
    switch (command) {
      case '/help':
        await bot.sendMessage(chatId, t.commands.help);
        break;
        
      case '/about':
        await handleAboutCommand(chatId, platformKey, t, userLanguage);
        break;
        
      case '/reset':
        // Emergency reset command for stuck users
        delete userState[chatId];
        await bot.sendMessage(chatId, '🔄 Your session has been reset. Use /start to begin again.');
        break;
        
      case '/natal_chart':
        await handleNatalChartCommand(chatId, platformKey, t, userLanguage);
        break;
        
      case '/asteroids':
        await handleAsteroidsCommand(chatId, platformKey, t, userLanguage);
        break;
        
      case '/fixed_stars':
        await handleFixedStarsCommand(chatId, platformKey, t, userLanguage);
        break;
        
      case '/transit_asteroids':
        await handleTransitAsteroidsCommand(chatId, platformKey, t, userLanguage);
        break;
        
      case '/transit_fixed_stars':
        await handleTransitFixedStarsCommand(chatId, platformKey, t, userLanguage);
        break;
        
      default:
        await bot.sendMessage(chatId, t.commands.help);
        break;
    }
  } catch (error) {
    console.error('❌ Error handling command:', error);
    await bot.sendMessage(chatId, '❌ An error occurred processing your command.');
  }
}

async function handleTelegramUpdate(update) {
  try {
    if (update.message) {
      const msg = update.message;
      
      // Handle /start command
      if (msg.text && msg.text.startsWith('/start')) {
        await handleStartCommand(msg);
        return;
      }
      
      // Handle other commands
      if (msg.text && msg.text.startsWith('/')) {
        console.log(`🔍 [handleTelegramUpdate] Routing command to handleCommands: "${msg.text}"`);
        await handleCommands(msg);
        return;
      }
      
      // Handle regular messages during chart creation
      if (msg.text) {
        // Check state BEFORE processing to determine if this should be a follow-up
        const stateBefore = userState[msg.chat.id];
        const wasInDoneState = stateBefore && stateBefore.step === 'done';
        
        // Process the message (might change user state)
        await handleMessage(msg);
        
        // Only handle as follow-up question if user was ALREADY in 'done' state before this message
        // AND the message is not a command
        if (wasInDoneState && !msg.text.startsWith('/')) {
          await handleFollowUpMessage(msg);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error handling update:', error);
  }
}

// Follow-up message handler function (extracted from bot.on)
async function handleFollowUpMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = userState[chatId];

  console.log('🔍 Follow-up message handler triggered for:', text);
  console.log('📋 User state:', state ? `step: ${state.step}` : 'no state');

  // Only proceed once user has completed birth-chart flow
  if (!state || state.step !== 'done') {
    console.log('⏸️ Skipping - user not in done state');
    return;
  }

  const platformKey = `telegram-${chatId}`;
  
  // Load persistent conversation history if not already loaded
  if (!state.conversationHistory) {
    try {
      state.conversationHistory = await getConversationHistory(platformKey, 20, 30);
      console.log(`💬 Loaded ${state.conversationHistory.length} previous messages for follow-up`);
    } catch (error) {
      console.error('❌ Failed to load conversation history:', error.message);
      state.conversationHistory = [];
    }
  }
  
  // Let the LLM handle context naturally through conversation history
  let enhancedQuestion = text;
  
  const payload = {
    userId: platformKey,
    question: enhancedQuestion,
    conversationHistory: state.conversationHistory,
    dialect: state.dialect || 'English'
  };

  try {
    console.log('🔄 Sending request to /interpret endpoint');
    
    // Send "please wait" message for follow-up questions
    const waitMessage = state.language === 'Arabic' 
      ? '🔮 جاري العمل على إجابة سؤالك، قد يستغرق هذا دقيقة واحدة...'
      : state.language === 'French'
      ? '🔮 Traitement de votre question en cours, cela peut prendre une minute...'
      : '🔮 Working on your question, this may take a minute...';
    
    await bot.sendMessage(chatId, waitMessage);
    await bot.sendChatAction(chatId, 'typing');
    const resp = await axios.post(`${SERVICE_URL}/interpret`, payload);
    console.log('✅ Response received from /interpret');
    const { answer, natalChart, transitChart } = resp.data;
    
    console.log('📊 Response data:', { 
      hasAnswer: !!answer, 
      hasNatalChart: !!natalChart, 
      hasTransitChart: !!transitChart,
      transitChartLength: Array.isArray(transitChart) ? transitChart.length : 0
    });
    
    // Send transit chart if available
    if (transitChart && Array.isArray(transitChart) && transitChart.length > 0) {
      console.log('📈 Sending transit chart');
      const transitMsg = formatTransitChart(transitChart, state.language || 'English');
      await bot.sendMessage(chatId, transitMsg, {
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id
      });
    }
    
    // Send the interpretation answer (split if too long)
    if (answer) {
      console.log('💬 Sending interpretation answer');
      
      // Save both user question and assistant response to persistent conversation history
      try {
        await saveConversationMessage(
          platformKey, 
          'user', 
          enhancedQuestion,
          { type: 'follow_up_question' }
        );
        
        await saveConversationMessage(
          platformKey, 
          'assistant', 
          answer,
          { type: 'follow_up_response', hasTransits: !!(transitChart && transitChart.length > 0) }
        );
        
        // Also update in-memory for current session
        state.conversationHistory.push({
          role: 'user',
          content: enhancedQuestion,
          timestamp: new Date()
        });
        
        state.conversationHistory.push({
          role: 'assistant',
          content: answer,
          timestamp: new Date()
        });
        
        // Keep only last 6 exchanges in memory to avoid context bloat
        if (state.conversationHistory.length > 12) { // 6 user + 6 assistant messages
          state.conversationHistory = state.conversationHistory.slice(-12);
          console.log('✂️ Trimmed in-memory conversation history to last 6 exchanges');
        }
        
        console.log('💾 Saved follow-up conversation to persistent storage');
      } catch (error) {
        console.error('❌ Failed to save follow-up conversation to Firestore:', error.message);
      }
      
      // Split message if it's too long for Telegram (4096 char limit)
      const maxLength = 4000; // Leave some buffer
      if (answer.length <= maxLength) {
        return bot.sendMessage(chatId, answer, { reply_to_message_id: msg.message_id });
      } else {
        console.log(`📏 Message too long (${answer.length} chars), splitting...`);
        let startIndex = 0;
        let messageCount = 0;
        
        while (startIndex < answer.length) {
          let endIndex = Math.min(startIndex + maxLength, answer.length);
          
          // Try to break at a natural point (paragraph, sentence, or word)
          if (endIndex < answer.length) {
            const slice = answer.slice(startIndex, endIndex);
            const lastParagraph = slice.lastIndexOf('\n\n');
            const lastSentence = slice.lastIndexOf('. ');
            const lastWord = slice.lastIndexOf(' ');
            
            if (lastParagraph > startIndex + 500) {
              endIndex = startIndex + lastParagraph + 2;
            } else if (lastSentence > startIndex + 500) {
              endIndex = startIndex + lastSentence + 2;
            } else if (lastWord > startIndex + 100) {
              endIndex = startIndex + lastWord;
            }
          }
          
          const chunk = answer.slice(startIndex, endIndex).trim();
          
          try {
            if (messageCount === 0) {
              await bot.sendMessage(chatId, chunk, { reply_to_message_id: msg.message_id });
            } else {
              await bot.sendMessage(chatId, chunk);
            }
            messageCount++;
            startIndex = endIndex;
          } catch (sendErr) {
            console.error('❌ Error sending message chunk:', sendErr.message);
            break;
          }
        }
        
        console.log(`✅ Sent ${messageCount} message chunks`);
        return;
      }
    } else {
      console.log('❓ No answer received');
      return bot.sendMessage(chatId, '❓ No interpretation available.', { reply_to_message_id: msg.message_id });
    }
  } catch (err) {
    console.error('❌ Interpretation error:', err.message);
    console.error('📍 Full error:', err);
    return bot.sendMessage(chatId, '❌ Something went wrong. Please try again.');
  }
}

// If running standalone, set up polling-based event handlers
if (isStandalone) {
  console.log('🔧 Setting up polling-based event handlers for standalone mode');
  
  bot.onText(/\/start/, async (msg) => {
    try {
      await handleStartCommand(msg);
    } catch (error) {
      console.error('❌ Error in /start handler:', error);
    }
  });
  
  bot.on('message', async (msg) => {
    try {
      if (msg.text && !msg.text.startsWith('/start')) {
        // Handle other commands first (same logic as webhook handler)
        if (msg.text.startsWith('/')) {
          console.log(`🔍 [Polling] Routing command to handleCommands: "${msg.text}"`);
          await handleCommands(msg);
          return;
        }
        
        // Use the same logic as webhook handler to prevent double processing
        const stateBefore = userState[msg.chat.id];
        const wasInDoneState = stateBefore && stateBefore.step === 'done';
        
        console.log(`🔍 Before handleMessage - User ${msg.chat.id} state: ${stateBefore ? stateBefore.step : 'no state'}`);
        
        // Process the message (might change user state)
        await handleMessage(msg);
        
        // Only handle as follow-up question if user was ALREADY in 'done' state before this message
        // AND the message is not a command
        if (wasInDoneState && !msg.text.startsWith('/')) {
          console.log(`✅ Processing as follow-up question for user ${msg.chat.id} (was in done state)`);
          await handleFollowUpMessage(msg);
        } else {
          console.log(`⏸️ Skipping follow-up handler - user ${msg.chat.id} was not in done state before message or was a command`);
        }
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      console.error('❌ Error stack:', error.stack);
      // Try to send error message to user
      try {
        await bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again or use /start to restart.');
      } catch (sendError) {
        console.error('❌ Failed to send error message to user:', sendError);
      }
    }
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
  });
  
  console.log('✅ Standalone bot ready - polling mode active');
}

// Function to set up bot commands with descriptions
async function setupBotCommands() {
  try {
    const commands = [
      { command: 'start', description: 'Create your natal chart' },
      { command: 'about', description: 'About AstroHabibi' },
      { command: 'natal_chart', description: 'View your saved natal chart' },
      { command: 'asteroids', description: 'View asteroids in your chart' },
      { command: 'fixed_stars', description: 'View fixed stars in your chart' },
      { command: 'transit_asteroids', description: 'Current transit asteroids' },
      { command: 'transit_fixed_stars', description: 'Current transit fixed stars' },
      { command: 'reset', description: 'Reset your session' },
      { command: 'help', description: 'Show available commands' }
    ];
    
    await bot.setMyCommands(commands);
    console.log('✅ Bot commands set up successfully');
  } catch (error) {
    console.error('❌ Error setting up bot commands:', error);
  }
}

module.exports = { bot, handleTelegramUpdate, setupWebhook, setupBotCommands };
