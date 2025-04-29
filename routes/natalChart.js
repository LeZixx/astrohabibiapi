const express = require('express');
const router = express.Router();
const { calcJulianDayAndCoords } = require('../utils/astrology');

router.post('/', async (req, res) => {
  console.log("🛠️ [natal-chart] req.body =", req.body);
  const { birthDate, birthTime, birthPlace } = req.body;
  if (!birthDate || !birthTime || !birthPlace) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    const { julianDay, lat, lon } = await calcJulianDayAndCoords(birthDate, birthTime, birthPlace);
    return res.json({ julianDay, lat, lon });
  } catch (error) {
    console.error("🛠️ [natal-chart] calculation error:", error);
    return res.status(500).json({ error: 'Failed to calculate coordinates' });
  }
});

module.exports = router;