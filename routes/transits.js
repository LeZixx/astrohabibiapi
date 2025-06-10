

const express = require('express');
const router = express.Router();
const { getLiveTransits } = require('../utils/transitCalculator');
// If you have an interpretation helper, adjust the path as needed:
let interpretTransits;
try {
  interpretTransits = require('../utils/interpretation').interpretTransits;
} catch (e) {
  interpretTransits = null;
}

router.post('/', async (req, res) => {
  try {
    const chartData = req.body;
    if (!chartData) {
      return res.status(400).json({ error: 'Request body must contain chartData.' });
    }
    const transits = getLiveTransits(chartData);
    let interpretation;
    if (interpretTransits) {
      interpretation = interpretTransits(transits, chartData);
    }
    return res.json({ transits, interpretation });
  } catch (err) {
    console.error('Error computing live transits:', err);
    return res.status(500).json({ error: 'Failed to compute live transits.' });
  }
});

module.exports = router;