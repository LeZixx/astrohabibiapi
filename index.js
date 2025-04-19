const express = require("express");
const { DateTime } = require("luxon");
const cors = require("cors");

console.log("🚀 Starting AstroHabibi server...");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/natal-chart", (req, res) => {
  const { date, time, lat, lon, timezone } = req.body;

  if (!date || !time || lat === undefined || lon === undefined) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const localTime = DateTime.fromFormat(`${date} ${time}`, "yyyy-MM-dd HH:mm", {
      zone: timezone || "UTC"
    });

    const dt = localTime.toUTC();

    if (!dt.isValid) {
      return res.status(400).json({ error: "Invalid date or time format" });
    }

    const julianDay = (dt.toMillis() / 86400000) + 2440587.5;

    res.json({
      timestamp: dt.toISO(),
      unix: dt.toUnixInteger(),
      julianDay,
      coordinates: {
        latitude: lat,
        longitude: lon
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Time API is live on port ${PORT}`));