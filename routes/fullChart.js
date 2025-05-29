const express = require("express");
const router = express.Router();
const { calcJulianDayAndCoords, calculateFullChart } = require("../utils/astrology");

// helper to convert a degree to a zodiac sign name
function degreeToSign(deg) {
  const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  return signs[Math.floor((deg % 360) / 30)];
}

const { interpretChart } = require("../utils/interpreter");

router.post("/", async (req, res) => {
  const { birthDate, birthTime, birthPlace, dialect, withInterpretation } = req.body;

  if (!birthDate || !birthTime || !birthPlace) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const { julianDay, lat, lon } = await calcJulianDayAndCoords(birthDate, birthTime, birthPlace);
    // Reject if we couldn’t compute a valid Julian Day
    if (typeof julianDay !== "number" || isNaN(julianDay)) {
      return res.status(400).json({ error: "Invalid birth date or time; could not compute Julian Day" });
    }
    const fullChart = await calculateFullChart({ julianDay, lat, lon });
    const { ascendant, houses, planets } = fullChart;

    // derive rising sign
    const risingSign = degreeToSign(ascendant);
    // label planets with sign & house number
    const labeledPlanets = planets.map(p => {
      const sign = degreeToSign(p.longitude);
      // find house: first cusp greater than longitude, fallback to 12
      const houseNumber = houses.findIndex(cusp => p.longitude < cusp) + 1 || 12;
      return { ...p, sign, house: houseNumber };
    });

    let response = {
      julianDay,
      lat,
      lon,
      ascendant,
      risingSign,
      houses,
      planets: labeledPlanets
    };

    if (withInterpretation && dialect) {
      try {
        const interpretation = await interpretChart({ chartData: response, dialect });
        response.interpretation = interpretation;
      } catch (interpretErr) {
        console.warn("🛑 Failed to generate interpretation:", interpretErr.message);
        response.interpretation = "Interpretation unavailable at the moment.";
      }
    }

    return res.json(response);
  } catch (err) {
    console.error("🔥 Full chart calculation failed with error:", err);
    return res.status(500).json({ error: err.message || "Failed to calculate birth chart." });
  }
});

module.exports = router;