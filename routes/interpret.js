// routes/interpret.js
const express = require('express');
const router = express.Router();
console.log('🎯 [routes/interpret] route file loaded');
const { interpretChart } = require('../utils/interpreter');

router.post('/', async (req, res) => {
  console.log('🎯 [routes/interpret] POST /interpret received with body:', req.body);
  const { chartData, dialect } = req.body;
  if (!chartData || !dialect) {
    return res.status(400).json({ error: 'Missing chartData or dialect' });
  }
  try {
    const interpretation = await interpretChart({ chartData, dialect });
    return res.json({ interpretation });
  } catch (err) {
    console.error('Error in /interpret:', err);
    return res.status(500).json({ error: 'Interpretation failed' });
  }
});

module.exports = router;