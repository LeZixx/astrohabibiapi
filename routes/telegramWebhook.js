const express = require('express');
const router = express.Router();

// Import the bot logic from telegramBot.js
const { handleTelegramUpdate } = require('../telegramBot');

console.log('🪝 [routes/telegramWebhook] Webhook route loaded');

// Handle incoming webhook updates from Telegram
router.post('/', async (req, res) => {
  try {
    console.log('🪝 Received webhook update:', JSON.stringify(req.body, null, 2));
    
    // Process the update using the bot logic
    await handleTelegramUpdate(req.body);
    
    // Always respond with 200 to Telegram
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    // Still respond with 200 to prevent Telegram from retrying
    res.status(200).send('ERROR');
  }
});

module.exports = router;