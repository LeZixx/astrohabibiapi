const express = require("express");
const router = express.Router();
const { calcJulianDayAndCoords, calculateFullChart } = require("../utils/astrology");
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

    let response = { julianDay, lat, lon, ascendant, houses, planets };

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