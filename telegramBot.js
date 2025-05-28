// telegramBot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

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
  userState[chatId] = { step: 'date' };
  bot.sendMessage(chatId, '🌟 Welcome to AstroHabibi! Please enter your birth date (e.g. 24 September 1992):');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = userState[chatId];
  if (!state) return;

  try {
    if (state.step === 'date') {
      state.birthDate = text;
      state.step = 'time';
      return bot.sendMessage(chatId, '⏰ Thanks! Now please enter your birth time (e.g. 9:10 AM):');
    }
    if (state.step === 'time') {
      state.birthTime = text;
      state.step = 'place';
      return bot.sendMessage(chatId, '📍 Great! Finally, enter your birth place (e.g. Beirut, Lebanon):');
    }
    if (state.step === 'place') {
      state.birthPlace = text;
      state.step = 'done';
      bot.sendMessage(chatId, '🔮 Calculating your full chart and interpretation, please wait...');
      // Call Cloud Run endpoint
      const payload = {
        birthDate: state.birthDate,
        birthTime: state.birthTime,
        birthPlace: state.birthPlace,
        dialect: 'Lebanese',           // you can prompt for dialect too
        withInterpretation: true
      };
      const res = await axios.post(`${SERVICE_URL}/full-chart`, payload);
      const reply = formatChartResponse(res.data);
      return bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('Bot error:', err);
    bot.sendMessage(chatId, '❌ Oops, something went wrong. Please try again later.');
  }
});

function formatChartResponse(data) {
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
  if (data.interpretation) {
    text += `\n🔮 *Interpretation:*\n${data.interpretation}`;
  }
  return text;
}

module.exports = bot;
