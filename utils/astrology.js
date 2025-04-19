const se = require("swisseph");

se.swe_set_ephe_path(__dirname + "/../ephe"); // Path to ephe folder

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
  const ascDegree = houseData.ascmc[se.SE_ASC];
  const mcDegree = houseData.ascmc[se.SE_MC];

  const houses = houseData.cusps.map((deg, idx) => ({
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