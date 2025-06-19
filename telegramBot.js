console.log('🤖 [telegramBot.js] Loaded updated code at', new Date().toISOString());
// telegramBot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

// Initialize Firebase Admin if this is run as main module (standalone)
// When run through index.js, Firebase is already initialized there
if (require.main === module) {
  const admin = require('firebase-admin');
  try {
    // For local development: load service account key
    const serviceAccount = require('./utils/astrohabibi-firestore-sa-key.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('🗄️ Firebase Admin initialized with service account (standalone mode).');
  } catch (err) {
    // In production or if JSON not present, use default credentials
    admin.initializeApp();
    console.log('🗄️ Firebase Admin initialized with default credentials (standalone mode).');
  }
}


const { getLatestChart, saveConversationMessage, getConversationHistory } = require('./utils/firestore');


// Helper to convert a degree to sign name and degrees/minutes
function degreeToSignDetails(deg, language) {
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
    dialectPrompt: '🗣️ اختر لهجتك العربية:',
    dayPrompt:     '📅 اختر يوم ميلادك:',
    monthPrompt:   '📅 اختر شهر ميلادك (1-12):',
    yearPrompt:    '📅 اختر سنة ميلادك:',
    hourPrompt:    '⏰ اختر ساعة الميلاد (0-23):',
    minutePrompt:  '⏰ اختر دقيقة الميلاد (0-59):',
    placePrompt:   '📍 ممتاز! وأخيراً، أدخل مكان ميلادك (مثال: بيروت، لبنان):',
    calculating:   '🔮 يتم الآن حساب خريطتك الفلكية والقراءة الروحية، يرجى الانتظار...',
    chartReady:    '✨ تم إنشاء خريطتك الفلكية! الآن سأقوم بإعداد التفسير الروحي المفصل، هذا قد يستغرق دقيقة واحدة...',
    interpretationIntro: '🔮 دعني أضع لك قراءة روحية مختصرة حسب موقع الكواكب والأبراج...',
    backLabel: '⬅️ رجوع',
    unknownTimeLabel: 'غير معروف',
    confirmPlacePrompt: '📌 اختر أقرب تطابق لبلدتك:',
  },
  English: {
    dialectPrompt:     '',
    dayPrompt:         '📅 Please choose your birth day:',
    monthPrompt:       '📅 Please choose your birth month (1-12):',
    yearPrompt:        '📅 Please choose your birth year:',
    hourPrompt:        '⏰ Please choose your birth hour (0-23):',
    minutePrompt:      '⏰ Please choose your birth minute (0-59):',
    placePrompt:       '📍 Great! Finally, enter your birth place (e.g. Beirut, Lebanon):',
    calculating:       '🔮 Calculating your full chart and interpretation, please wait...',
    chartReady:        '✨ Your natal chart is ready! Now preparing your detailed spiritual interpretation, this may take a minute...',
    interpretationIntro:'🔮 Here’s a spiritual reading based on your planetary positions...',
    backLabel: '⬅️ Back',
    unknownTimeLabel: 'Unknown',
    confirmPlacePrompt: '📌 Please choose the best match for your birthplace:',
  },
  French: {
    dialectPrompt: '',
    dayPrompt: '📅 Veuillez choisir le jour de naissance:',
    monthPrompt: '📅 Veuillez choisir le mois de naissance (1-12):',
    yearPrompt: "📅 Veuillez choisir l'année de naissance:",
    hourPrompt: '⏰ Veuillez choisir l\'heure de naissance (0-23):',
    minutePrompt: '⏰ Veuillez choisir la minute de naissance (0-59):',
    placePrompt: '📍 Parfait ! Enfin, entrez votre lieu de naissance (ex: Beyrouth, Liban):',
    calculating: '🔮 Calcul de votre carte du ciel et de l\'interprétation spirituelle en cours...',
    chartReady: '✨ Votre thème natal est prêt ! Préparation de votre interprétation spirituelle détaillée, cela peut prendre une minute...',
    interpretationIntro: '🔮 Voici une lecture spirituelle basée sur vos positions planétaires...',
    backLabel: '⬅️ Retour',
    unknownTimeLabel: 'Inconnu',
    confirmPlacePrompt: '📌 Choisissez le lieu correspondant :',
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
const bot = new TelegramBot(BOT_TOKEN, { 
  polling: isStandalone ? true : false 
});

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
  
  const WEBHOOK_URL = `${SERVICE_URL}/bot${BOT_TOKEN}`;
  console.log('🪝 Setting webhook URL:', WEBHOOK_URL);
  
  try {
    await bot.setWebHook(WEBHOOK_URL);
    console.log('✅ Webhook set successfully');
  } catch (error) {
    console.error('❌ Failed to set webhook:', error.message);
    // Don't throw - just log the error
  }
}

// Simple state storage (in-memory; replace with DB for production)
const userState = {};

// Handle /start command
async function handleStartCommand(msg) {
  const chatId = msg.chat.id;
  userState[chatId] = { step: 'language' };
  await bot.sendMessage(chatId, '🌐 Choose your language العربية | English | Français', {
    reply_markup: { keyboard: [['العربية','English','Français']], one_time_keyboard: true }
  });
}

// Handle regular messages
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = userState[chatId];
  if (!state) return;

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
            one_time_keyboard: true
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
          reply_markup: { keyboard: yearRows, one_time_keyboard: true }
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
          reply_markup: { keyboard: hourRows, one_time_keyboard: true }
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
          reply_markup: { keyboard: minuteRows, one_time_keyboard: true }
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
      if (text === 'العربية') {
        state.language = 'Arabic';
        state.dialect = 'MSA';
        state.step = 'birth-day';
        return bot.sendMessage(chatId, translations.Arabic.dayPrompt, {
          reply_markup: {
            keyboard: [
              ['1','2','3','4','5','6','7'],
              ['8','9','10','11','12','13','14'],
              ['15','16','17','18','19','20','21'],
              ['22','23','24','25','26','27','28'],
              ['29','30','31'],
              [translations['Arabic'].backLabel]
            ],
            one_time_keyboard: true
          }
        });
      } else if (text === 'English') {
        state.language = 'English';
        state.dialect = 'English';
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
            one_time_keyboard: true
          }
        });
      } else if (text === 'Français') {
        state.language = 'French';
        state.dialect = 'French';
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
            one_time_keyboard: true
          }
        });
      } else {
        // If invalid language choice, prompt again
        bot.sendMessage(chatId, '🌐 Please choose a language from the keyboard: العربية | English | Français', {
          reply_markup: { keyboard: [['العربية','English','Français']], one_time_keyboard: true }
        });
        return;
      }
    }

    // Handle birth day selection
    if (state.step === 'birth-day') {
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
          one_time_keyboard: true
        }
      });
    }

    // Handle birth month selection
    if (state.step === 'birth-month') {
      state.birthMonth = text;
      state.step = 'birth-year';
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
        reply_markup: {
          keyboard: yearRows,
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
    }

    // Handle birth year selection
    if (state.step === 'birth-year') {
      state.birthYear = text;
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
        reply_markup: { keyboard: hourRows, one_time_keyboard: true }
      });
    }

    // Handle birth hour selection
    if (state.step === 'birth-hour') {
      // If user selects unknown/back, handled above
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
          one_time_keyboard: true
        }
      });
    }

    // Handle birth minute selection
    if (state.step === 'birth-minute') {
      // If user selects unknown/back, handled above
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
      return bot.sendMessage(chatId, promptText);
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
        const geoRes = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: rawPlaceQuery, format: 'json', limit: 5 },
          headers: {
            'User-Agent': 'AstroHabibi-Bot/1.0 (https://astrohabibi.com; contact@astrohabibi.com)'
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

      // Build keyboard rows of display_name
      const keyboardRows = geoResults.map(place => [{ text: place.display_name }]);
      return bot.sendMessage(
        chatId,
        translations[state.language].confirmPlacePrompt,
        {
          reply_markup: {
            keyboard: keyboardRows,
            one_time_keyboard: true,
            resize_keyboard: true
          }
        }
      );
    }

    // Handle selection of a geocoded birthplace
    if (state.step === 'birth-place-confirm') {
      const chosenText = text;
      const found = (state.candidates || []).find(c => c.display_name === chosenText);
      if (!found) {
        return bot.sendMessage(chatId,
          state.language === 'Arabic'
            ? '❌ الرجاء الضغط على أحد الخيارات المعروضة بالأسفل.'
            : state.language === 'French'
              ? '❌ Veuillez sélectionner une option ci-dessous.'
              : '❌ Please choose one of the buttons below.'
        );
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
        withInterpretation: true
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
        console.error('❌ Failed to load conversation history:', error.message);
        state.conversationHistory = []; // Fallback to empty history
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
        
        const interpResp = await axios.post(`${SERVICE_URL}/interpret`, {
          userId: platformKey,
          question: 'Please provide a spiritual interpretation of my natal chart.',
          dialect: state.language === 'Arabic' ? 'MSA' : state.language,
          conversationHistory: state.conversationHistory
        });
        const fullText = interpResp.data.answer || '';
        
        // Save the natal chart interpretation to persistent conversation history
        try {
          await saveConversationMessage(
            platformKey, 
            'user', 
            'Please provide a spiritual interpretation of my natal chart.',
            { type: 'natal_chart_request', chartId: state.lastChart?.chartId }
          );
          
          await saveConversationMessage(
            platformKey, 
            'assistant', 
            fullText,
            { type: 'natal_chart_interpretation', chartId: state.lastChart?.chartId }
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
      'NORTH NODE': 'NORTH NODE', LILITH: 'LILTH'
    },
    Arabic: {
      SUN: 'الشمس', MOON: 'القمر', MERCURY: 'عطارد', VENUS: 'الزهرة',
      MARS: 'المريخ', JUPITER: 'المشتري', SATURN: 'زحل',
      URANUS: 'أورانوس', NEPTUNE: 'نبتون', PLUTO: 'بلوتو',
      'NORTH NODE': 'عقدة الشمال', LILITH: 'ليليث'
    },
    French: {
      SUN: 'SOLEIL', MOON: 'LUNE', MERCURY: 'MERCURE', VENUS: 'VENUS',
      MARS: 'MARS', JUPITER: 'JUPITER', SATURN: 'SATURNE',
      URANUS: 'URANUS', NEPTUNE: 'NEPTUNE', PLUTO: 'PLUTON',
      'NORTH NODE': 'NŒUD NORD', LILITH: 'LILITH'
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

  // Planets
  const planetLabel = isAr
    ? 'الكواكب'
    : isFr
    ? 'Planètes'
    : 'Planets';
  if (Array.isArray(data.planets)) {
    lines.push(`• ${planetLabel}:`);
    data.planets.forEach(p => {
      // p.longitude is numeric
      const pDet = degreeToSignDetails(p.longitude, language);
      const translatedName = planetTranslations[language][p.name] || p.name;
      const pLabel = isAr
        ? `${translatedName} في ${pDet.signName}`
        : isFr
        ? `${translatedName} en ${pDet.signName}`
        : `${translatedName} in ${pDet.signName}`;
      // Determine localized retrograde marker
      let retroMarker = '';
      if (p.retrograde) {
        if (language === 'Arabic') {
          retroMarker = ' (رجعي)';
        } else if (language === 'French') {
          retroMarker = ' (R)';
        } else {
          retroMarker = ' (R)';
        }
      }
      lines.push(`  - ${pLabel} ${pDet.degree}°${pDet.minutes}′${retroMarker}`);
    });
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
async function handleTelegramUpdate(update) {
  try {
    if (update.message) {
      const msg = update.message;
      
      // Handle /start command
      if (msg.text && msg.text.startsWith('/start')) {
        await handleStartCommand(msg);
        return;
      }
      
      // Handle regular messages during chart creation
      if (msg.text) {
        await handleMessage(msg);
        
        // Also handle follow-up questions
        await handleFollowUpMessage(msg);
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
  
  bot.onText(/\/start/, handleStartCommand);
  
  bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/start')) {
      await handleMessage(msg);
      await handleFollowUpMessage(msg);
    }
  });
  
  console.log('✅ Standalone bot ready - polling mode active');
}

module.exports = { bot, handleTelegramUpdate, setupWebhook };
