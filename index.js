require('dotenv').config();
const admin = require('firebase-admin');
try {
  // Attempt to load local service account (development)
  const serviceAccount = require('./utils/astrohabibi-firestore-sa-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('🗄️ Firebase Admin initialized with service account.');
} catch (err) {
  // Fallback to default credentials (e.g., on Cloud Run)
  admin.initializeApp();
  console.log('🗄️ Firebase Admin initialized with default credentials.');
}
console.log('🔑 SONAR_API_KEY=', process.env.SONAR_API_KEY);
console.log('🔑 TELEGRAM_BOT_TOKEN=', process.env.TELEGRAM_BOT_TOKEN);
console.log('🔑 SERVICE_URL=', process.env.SERVICE_URL);
const interpretRoute = require('./routes/interpret');
const express = require("express");
const { DateTime } = require("luxon");
const cors = require("cors");

console.log("🚀 Starting AstroHabibi server...");
const swisseph = require("swisseph");
const path = require("path");
swisseph.swe_set_ephe_path(path.join(__dirname, "ephe"));

const app = express();
app.use(cors());

app.use(express.json());

// handle malformed JSON bodies without crashing the server
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.warn('Invalid JSON received:', err.message);
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  next(err);
});

// Debug logger for all requests
app.use((req, res, next) => {
  console.log(`🕵️ [DEBUG] ${req.method} ${req.originalUrl} - body:`, req.body);
  next();
});

const fullChartRoute = require("./routes/fullChart");
const natalRoute = require('./routes/natalChart');
const transitsRouter = require('./routes/transits');
const conversationManagementRouter = require('./routes/conversationManagement');

app.use("/full-chart", fullChartRoute);
app.use('/natal-chart', natalRoute);
app.use('/interpret', interpretRoute);
app.use('/transits', transitsRouter);
app.use('/conversations', conversationManagementRouter);

// Add Telegram webhook endpoint only if BOT_TOKEN is available
if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    const telegramWebhook = require('./routes/telegramWebhook');
    app.use('/webhook', telegramWebhook);
    console.log('🪝 Telegram webhook endpoint registered at /webhook');
  } catch (error) {
    console.error('❌ Failed to register Telegram webhook endpoint:', error.message);
  }
} else {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN not set - webhook endpoint not registered');
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Time API is live on port ${PORT}`);
  
  // Set up Telegram webhook after server starts (async, non-blocking)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    setTimeout(async () => {
      try {
        const { setupWebhook } = require('./telegramBot');
        await setupWebhook();
      } catch (error) {
        console.error('⚠️ Could not set up Telegram webhook:', error.message);
      }
    }, 2000); // Delay webhook setup by 2 seconds
  }
});