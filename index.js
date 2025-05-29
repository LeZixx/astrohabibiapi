require('dotenv').config();
console.log('🔑 SONAR_API_KEY=', process.env.SONAR_API_KEY);
console.log('🔑 TELEGRAM_BOT_TOKEN=', process.env.TELEGRAM_BOT_TOKEN);
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

// Debug logger for all requests
app.use((req, res, next) => {
  console.log(`🕵️ [DEBUG] ${req.method} ${req.originalUrl} - body:`, req.body);
  next();
});

const fullChartRoute = require("./routes/fullChart");
const natalRoute = require('./routes/natalChart');

app.use("/full-chart", fullChartRoute);
app.use('/natal-chart', natalRoute);
app.use('/interpret', interpretRoute);

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Time API is live on port ${PORT}`));