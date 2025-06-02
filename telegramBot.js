console.log('🤖 [telegramBot.js] Loaded updated code at', new Date().toISOString());
// telegramBot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

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
    interpretationIntro: '🔮 دعني أضع لك قراءة روحية مختصرة حسب موقع الكواكب والأبراج...'
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
    interpretationIntro:'🔮 Here’s a spiritual reading based on your planetary positions...'
  },
  French: {
    dialectPrompt:     '',
    dayPrompt:         '📅 Veuillez choisir le jour de naissance:',
    monthPrompt:       '📅 Veuillez choisir le mois de naissance (1-12):',
    yearPrompt:        '📅 Veuillez choisir l\'année de naissance:',
    hourPrompt:        '⏰ Veuillez choisir l\'heure de naissance (0-23):',
    minutePrompt:      '⏰ Veuillez choisir la minute de naissance (0-59):',
    placePrompt:       '📍 Parfait ! Enfin, entrez votre lieu de naissance (ex: Beyrouth, Liban):',
    calculating:       '🔮 Calcul de votre carte du ciel et de l\'interprétation spirituelle en cours...',
    interpretationIntro:'🔮 Voici une lecture spirituelle basée sur vos positions planétaires...'
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
  bot.sendMessage(chatId, '🌐 Choose your language: Arabic | English | French', {
    reply_markup: { keyboard: [['Arabic','English','French']], one_time_keyboard: true }
  });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = userState[chatId];
  if (!state) return;

  try {
    if (state.step === 'language') {
      if (text === 'Arabic') {
        state.language = 'Arabic';
        bot.sendMessage(chatId, translations.Arabic.dialectPrompt, {
          reply_markup: {
            keyboard: [
              ['🇱🇧 لبناني', '🇪🇬 مصري'],
              ['🇸🇦 خليجي', '🇸🇾 شامي'],
              ['🇲🇦 مغاربي', '🇮🇶 عراقي']
            ],
            one_time_keyboard: true
          }
        });
        state.step = 'dialect';
        return;
      } else if (text === 'English' || text === 'French') {
        state.language = text;
        state.dialect = text;
        state.step = 'date';
        bot.sendMessage(chatId, translations[state.language].datePrompt, {
          reply_markup: { remove_keyboard: true }
        });
        return;
      } else {
        // If invalid language choice, prompt again
        bot.sendMessage(chatId, '🌐 Please choose a language from the keyboard: Arabic | English | French', {
          reply_markup: { keyboard: [['Arabic','English','French']], one_time_keyboard: true }
        });
        return;
      }
    }

    if (state.step === 'dialect') {
      state.dialect = text;
      state.step = 'birth-day';
      return bot.sendMessage(chatId, '📅 اختر يوم ميلادك:', {
        reply_markup: {
          keyboard: [
            ['1','2','3','4','5','6','7'],
            ['8','9','10','11','12','13','14'],
            ['15','16','17','18','19','20','21'],
            ['22','23','24','25','26','27','28'],
            ['29','30','31']
          ],
          one_time_keyboard: true
        }
      });
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
            ['9','10','11','12']
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
      return bot.sendMessage(chatId, translations[state.language].hourPrompt, {
        reply_markup: { keyboard: hourRows, one_time_keyboard: true }
      });
    }

    // Handle birth hour selection
    if (state.step === 'birth-hour') {
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
      return bot.sendMessage(chatId, translations[state.language].minutePrompt, {
        reply_markup: {
          keyboard: minuteRows,
          one_time_keyboard: true
        }
      });
    }

    // Handle birth minute selection
    if (state.step === 'birth-minute') {
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

      state.step = 'place';
      return bot.sendMessage(chatId, translations[state.language].placePrompt, {
        reply_markup: { remove_keyboard: true }
      });
    }

    if (state.step === 'place') {
      state.birthPlace = text;
      state.step = 'done';
      bot.sendMessage(chatId, translations[state.language].calculating);
      // Call Cloud Run endpoint
      const payload = {
        birthDate: state.birthDate,
        birthTime: state.birthTime,
        birthPlace: state.birthPlace,
        dialect: state.dialect || 'Lebanese',           // you can prompt for dialect too
        withInterpretation: true
      };
      const res = await axios.post(`${SERVICE_URL}/full-chart`, payload);
      // 1️⃣ send only the chart summary
      bot.sendMessage(chatId, formatChartSummary(res.data), { parse_mode: 'Markdown' });
      // 2️⃣ prompt for interpretation
      bot.sendMessage(chatId, translations[state.language].interpretationIntro, { parse_mode: 'Markdown' });
      // save the last chart data for follow-up questions
      state.lastChart = res.data;
      return;
    }
    if (state.step === 'place') {
      state.birthPlace = text;
      state.step = 'done';
      bot.sendMessage(chatId, translations[state.language].calculating);
      // Call Cloud Run endpoint
      const payload = {
        birthDate: state.birthDate,
        birthTime: state.birthTime,
        birthPlace: state.birthPlace,
        dialect: state.dialect || 'Lebanese',           // you can prompt for dialect too
        withInterpretation: true
      };
      const res = await axios.post(`${SERVICE_URL}/full-chart`, payload);
      // 1️⃣ send only the chart summary
      bot.sendMessage(chatId, formatChartSummary(res.data), { parse_mode: 'Markdown' });
      // 2️⃣ prompt for interpretation
      bot.sendMessage(chatId, translations[state.language].interpretationIntro, { parse_mode: 'Markdown' });
      // save the last chart data for follow-up questions
      state.lastChart = res.data;
      return;
    }
  } catch (err) {
    console.error('Bot error:', err);
    bot.sendMessage(chatId, '❌ Oops, something went wrong. Please try again later.');
  }
});

function formatChartSummary(data) {
  let text = `📜 *Your Birth Chart*\n`;
  text += `• Julian Day: \`${data.julianDay}\`\n`;
  text += `• Ascendant: \`${data.ascendant}°\`\n`;
  text += `• Houses:\n`;
  data.houses.forEach((h, i) => {
    text += `  - House ${i+1}: \`${h}°\`\n`;
  });
  text += `• Planets:\n`;
  data.planets.forEach(p => {
    text += `  - ${p.name}: \`${p.longitude}°\`\n`;
  });
  return text;
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
  if (!state || !state.lastChart) return;
  // prepend user question with instructions for Perplexity
  const prompt = `Please avoid any explicit religious wording (like "Allah", "Ya ibn Allah"); use spiritual terminology, and use "Falak" instead of "Abraj". Question: ${text}`;
  // ask interpretation endpoint
  try {
    // Show “typing…” indicator immediately
    await bot.sendChatAction(chatId, 'typing');

    const resp = await axios.post(`${SERVICE_URL}/interpret`, {
      chartData: state.lastChart,
      dialect: state.dialect || 'Lebanese'
    });
    const interp = resp.data.interpretation;
    return bot.sendMessage(chatId, interp, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Interpretation error:', err);
    return bot.sendMessage(chatId, '❌ حدث خطأ أثناء التفسير. حاول مرة ثانية.');
  }
});
