const express = require("express");
const router = express.Router();
const { calculateFullChart } = require("../utils/astrology");

router.post("/", (req, res) => {
  const { julianDay, lat, lon } = req.body;

  if (!julianDay || lat === undefined || lon === undefined) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const chart = calculateFullChart(julianDay, lat, lon);
    res.json(chart);
  } catch (err) {
    console.error("Chart generation error:", err);
    res.status(500).json({ error: "Failed to calculate birth chart." });
  }
});

module.exports = router;