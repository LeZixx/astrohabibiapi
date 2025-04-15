
const express = require("express");
const se = require("swisseph");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Set Swiss Ephemeris path to ephe directory
se.swe_set_ephe_path(__dirname + "/ephe");

app.post("/natal-chart", (req, res) => {
  const { date, time, lat, lon } = req.body;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const decimalHour = hour + minute / 60;

  const jd = se.swe_julday(year, month, day, decimalHour, se.SE_GREG_CAL);

  const asc = se.swe_houses(jd, lat, lon, "P");

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

  const houses = asc.cusps.map((deg, idx) => ({
    house: idx + 1,
    degree: deg.toFixed(2)
  }));

  res.json({
    ascendant: asc.ascmc[se.SE_ASC].toFixed(2),
    houses,
    planets,
    julianDay: jd
  });
});

app.listen(3000, () => console.log("Swiss Ephemeris API is live on port 3000"));
