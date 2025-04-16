const express = require("express");
const se = require("swisseph");
const cors = require("cors");

console.log("🚀 Starting AstroHabibi server...");

try {
  se.swe_set_ephe_path(__dirname + "/ephe");
  console.log("✅ Ephemeris path set");
} catch (err) {
  console.error("❌ Failed to set ephemeris path:", err);
}

const app = express();
app.use(cors());
app.use(express.json());

app.post("/natal-chart", (req, res) => {
  const { date, time, lat, lon } = req.body;

  if (!date || !time || lat === undefined || lon === undefined) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const decimalHour = hour + minute / 60;

  const jd = se.swe_julday(year, month, day, decimalHour, se.SE_GREG_CAL);
  const asc = se.swe_houses(jd, lat, lon, "P");

  if (!asc || !asc.house || !Array.isArray(asc.house)) {
    return res.status(500).json({ error: "Failed to calculate houses", rawAsc: asc });
  }

  const planetNames = {
    0: "Sun",
    1: "Moon",
    2: "Mercury",
    3: "Venus",
    4: "Mars",
    5: "Jupiter",
    6: "Saturn",
    7: "Uranus",
    8: "Neptune",
    9: "Pluto"
  };

  const planets = {};
  const planetIndices = Object.keys(planetNames).map(Number);

  planetIndices.forEach(index => {
    const result = se.swe_calc_ut(jd, index, se.SEFLG_SWIEPH);
    if (result && result.longitude !== undefined) {
      planets[planetNames[index]] = result.longitude.toFixed(2);
    }
  });

  const houses = asc.house.map((deg, idx) => ({
    house: idx + 1,
    degree: deg.toFixed(2)
  }));

  res.json({
    ascendant: asc.ascendant.toFixed(2),
    houses,
    planets,
    julianDay: jd
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Swiss Ephemeris API is live on port ${PORT}`));