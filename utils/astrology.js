const se = require("swisseph");
const path = require("path");

const ephePath = path.join(__dirname, "../ephe");
console.log("🗂️ Setting Swiss Ephemeris path to:", ephePath);

try {
  se.swe_set_ephe_path(ephePath);
  console.log("✅ Ephemeris path successfully set.");
} catch (err) {
  console.error("❌ Failed to set Ephemeris path:", err);
}

const getZodiacSign = (deg) => {
  const signs = [
    "Aries", "Taurus", "Gemini", "Cancer",
    "Leo", "Virgo", "Libra", "Scorpio",
    "Sagittarius", "Capricorn", "Aquarius", "Pisces"
  ];
  return signs[Math.floor(deg / 30)];
};

const calculateFullChart = (julianDay, lat, lon) => {
  const planetMap = {
    0: "Sun", 1: "Moon", 2: "Mercury", 3: "Venus", 4: "Mars",
    5: "Jupiter", 6: "Saturn", 7: "Uranus", 8: "Neptune", 9: "Pluto"
  };

  const planets = {};
  for (const [planetNum, name] of Object.entries(planetMap)) {
    const result = se.swe_calc_ut(julianDay, parseInt(planetNum), se.SEFLG_SWIEPH);
    planets[name] = {
      degree: parseFloat(result.longitude.toFixed(2)),
      sign: getZodiacSign(result.longitude),
      retrograde: result.retrograde || false
    };
  }

  const houseData = se.swe_houses(julianDay, lat, lon, "P");
  console.log("🔍 houseData returned from swe_houses:", houseData);

  const ascDegree = houseData.ascendant;
  const mcDegree = houseData.mc;

  const houses = houseData.house.map((deg, idx) => ({
    house: idx + 1,
    degree: parseFloat(deg.toFixed(2)),
    sign: getZodiacSign(deg)
  }));

  return {
    ascendant: {
      degree: parseFloat(ascDegree.toFixed(2)),
      sign: getZodiacSign(ascDegree)
    },
    midheaven: {
      degree: parseFloat(mcDegree.toFixed(2)),
      sign: getZodiacSign(mcDegree)
    },
    planets,
    houses
  };
};

module.exports = {
  getZodiacSign,
  calculateFullChart
};