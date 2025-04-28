const express = require('express');
const router = express.Router();
const { calcJulianDayAndCoords } = require('../utils/astrology');

router.post('/', (req, res) => {
  console.log("🛠️ [natal-chart] req.body =", req.body);
  const { birthDate, birthTime, birthPlace } = req.body;
  if (!birthDate || !birthTime || !birthPlace) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  const { julianDay, lat, lon } = calcJulianDayAndCoords(birthDate, birthTime, birthPlace);
  res.json({ julianDay, lat, lon });
});

module.exports = router;