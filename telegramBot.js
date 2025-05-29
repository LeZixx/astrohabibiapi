// telegramBot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const translations = {
  Arabic: {
    dialectPrompt: '🗣️ اختر لهجتك العربية:',
    datePrompt: '🌟 الرجاء إدخال تاريخ ميلادك (مثال: 15 أغسطس 1990):',
    timePrompt: '⏰ شكراً! الرجاء إدخال وقت ميلادك (مثال: 9:10 صباحاً):',
    placePrompt: '📍 ممتاز! وأخيراً، أدخل مكان ميلادك (مثال: بيروت، لبنان):',
    calculating: '🔮 يتم الآن حساب خريطتك الفلكية والقراءة الروحية، يرجى الانتظار...',
    interpretationIntro: '🔮 دعني أضع لك قراءة روحية مختصرة حسب موقع الكواكب والأبراج...'
  },
  English: {
    dialectPrompt: '',
    datePrompt: '🌟 Please enter your birth date (e.g. 15 August 1990):',
    timePrompt: '⏰ Thanks! Now please enter your birth time (e.g. 9:10 AM):',
    placePrompt: '📍 Great! Finally, enter your birth place (e.g. Beirut, Lebanon):',
    calculating: '🔮 Calculating your full chart and interpretation, please wait...',
    interpretationIntro: '🔮 Here’s a spiritual reading based on your planetary positions...'
  },
  French: {
    dialectPrompt: '',
    datePrompt: '🌟 Veuillez entrer votre date de naissance (ex: 15 août 1990):',
    timePrompt: '⏰ Merci ! Entrez maintenant votre heure de naissance (ex: 9:10):',
    placePrompt: '📍 Parfait ! Enfin, entrez votre lieu de naissance (ex: Beyrouth, Liban):',
    calculating: '🔮 Calcul de votre carte du ciel et de l\'interprétation spirituelle en cours...',
    interpretationIntro: '🔮 Voici une lecture spirituelle basée sur vos positions planétaires...'
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
      state.step = 'date';
      bot.sendMessage(chatId, translations[state.language].datePrompt, {
        reply_markup: { remove_keyboard: true }
      });
      return;
    }

    if (state.step === 'date') {
      state.birthDate = text;
      state.step = 'time';
      return bot.sendMessage(chatId, translations[state.language].timePrompt, {
        reply_markup: { remove_keyboard: true }
      });
    }
    if (state.step === 'time') {
      state.birthTime = text;
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
