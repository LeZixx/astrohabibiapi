console.log('🤖 [telegramBot.js] Loaded updated code at', new Date().toISOString());
// telegramBot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const admin = require('firebase-admin');
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


const { getLatestChart } = require('./utils/firestore');

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
    interpretationIntro: '🔮 دعني أضع لك قراءة روحية مختصرة حسب موقع الكواكب والأبراج...',
    backLabel: '⬅️ رجوع',
    unknownTimeLabel: 'غير معروف'
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
    interpretationIntro:'🔮 Here’s a spiritual reading based on your planetary positions...',
    backLabel: '⬅️ Back',
    unknownTimeLabel: 'Unknown'
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
    interpretationIntro: '🔮 Voici une lecture spirituelle basée sur vos positions planétaires...',
    backLabel: '⬅️ Retour',
    unknownTimeLabel: 'Inconnu'
  }
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in environment');
  process.exit(1);
}
const SERVICE_URL = process.env.SERVICE_URL;
if (!SERVICE_URL) {
  console.error('❌ SERVICE_URL is not set in environment');
  process.exit(1);
}
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Simple state storage (in-memory; replace with DB for production)
const userState = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { step: 'language' };
  bot.sendMessage(chatId, '🌐 Choose your language العربية | English | Français', {
    reply_markup: { keyboard: [['العربية','English','Français']], one_time_keyboard: true }
  });
});

bot.on('message', async (msg) => {
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
          reply_markup: { keyboard: [[translations[state.language].backLabel]], one_time_keyboard: true }
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
        reply_markup: { keyboard: yearRows, one_time_keyboard: true }
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
          params: { q: rawPlaceQuery, format: 'json', limit: 5 }
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
        state.language === 'Arabic'
          ? '📌 اختر أقرب تطابق لبلدتك:'
          : state.language === 'French'
            ? '📌 Choisissez le lieu correspondant :'
            : '📌 Please choose the best match for your birthplace:',
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

      await bot.sendMessage(
        chatId,
        formatChartSummary(chartRes.data, state.language),
        { parse_mode: 'Markdown' }
      );
      // Save in-memory for follow-ups
      state.lastChart = chartRes.data;

      await bot.sendChatAction(chatId, 'typing');
      try {
        const interpResp = await axios.post(`${SERVICE_URL}/interpret`, {
          chartData: chartRes.data,
          dialect:   state.language === 'Arabic' ? 'MSA' : state.language
        });
        const fullText = interpResp.data.interpretation || '';
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
    bot.sendMessage(chatId, '❌ Oops, something went wrong. Please try again later.');
  }
});


function formatChartSummary(data, language = 'English') {
  const isAr = language === 'Arabic';
  const isFr = language === 'French';
  const lines = [];

  const title = isAr
    ? '📜 مخططك الفلكي'
    : isFr
    ? '📜 Votre carte du ciel'
    : '📜 Your Birth Chart';
  lines.push(title);

  // Ascendant
  const asc = degreeToSignDetails(data.ascendant, language);
  const ascLabel = isAr
    ? 'الطالع'
    : isFr
    ? 'Ascendant'
    : 'Ascendant';
  lines.push(`• ${ascLabel}: \`${asc.signName} ${asc.degree}°${asc.minutes}′\``);

  // Houses
  const housesLabel = isAr
    ? 'البيوت'
    : isFr
    ? 'Maisons'
    : 'Houses';
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

  // Planets
  const planetLabel = isAr
    ? 'الكواكب'
    : isFr
    ? 'Planètes'
    : 'Planets';
  lines.push(`• ${planetLabel}:`);
  data.planets.forEach(p => {
    // p.longitude is numeric
    const pDet = degreeToSignDetails(p.longitude, language);
    const pLabel = isAr
      ? `${p.name} في ${pDet.signName}`
      : isFr
      ? `${p.name} en ${pDet.signName}`
      : `${p.name} in ${pDet.signName}`;
    lines.push(`  - ${pLabel} ${pDet.degree}°${pDet.minutes}′`);
  });

  return lines.join('\n');
}

function formatFullInterpretation(data) {
  return data.interpretation;
}

module.exports = bot;

// Catch-all handler for follow-up interpretation questions
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = userState[chatId];

  // If user is not done with the birth-data flow, ignore here
  if (!state || state.step !== 'done') return;

  // Prefer in-memory lastChart; otherwise fetch from Firestore
  let chartData = state.lastChart;
  if (!chartData) {
    const platformKey = `telegram-${chatId}`;
    try {
      const chartRecord = await getLatestChart(platformKey);
      if (chartRecord && chartRecord.rawChartData) {
        chartData = chartRecord.rawChartData;
      }
    } catch (fsErr) {
      console.error('Firestore error fetching chart:', fsErr);
    }
  }
  if (!chartData) {
    return bot.sendMessage(
      chatId,
      '🙏 يرجى أولاً إنشاء خريطتك الفلكية عبر /start ثم اتّباع التعليمات.'
    );
  }

  // Treat any incoming text as a question about the chart
  try {
    await bot.sendChatAction(chatId, 'typing');
    const payload = {
      chartData,
      dialect:  state?.dialect || 'Lebanese',
      question: text
    };
    const resp = await axios.post(`${SERVICE_URL}/interpret`, payload);
    const interp = resp.data.interpretation || '';
    const maxLength = 4000;
    let start = 0;
    while (start < interp.length) {
      let end = start + maxLength;
      if (end < interp.length) {
        let slice = interp.slice(start, end);
        const lastNewline = slice.lastIndexOf('\n');
        const lastSpace = slice.lastIndexOf(' ');
        const splitPos = Math.max(lastNewline, lastSpace);
        if (splitPos > -1) {
          end = start + splitPos;
        }
      }
      const chunk = interp.slice(start, end);
      await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      start = end;
    }
    return;
  } catch (err) {
    console.error('Interpretation error:', err);
    return bot.sendMessage(chatId, '❌ حدث خطأ أثناء التفسير. حاول مرة ثانية.');
  }
});
