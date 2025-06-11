const admin = require('firebase-admin');
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { getLiveTransits } = require('../utils/transitCalculator');
const interpreter = require('../utils/interpreter');

console.log('🔍 interpretChartQuery import:', require('../utils/interpreter'));
console.log('🎯 [routes/interpret] POST /interpret route loaded');
router.post('/', async (req, res) => {
  try {
    const { userId, question, dialect } = req.body;
    if (!userId || !question) {
      return res.status(400).json({ error: 'Request must include userId and question.' });
    }

    // 1. Fetch stored natal chart from Firestore
    const doc = await admin.firestore().collection('charts').doc(userId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Chart not found for this user.' });
    }
    const chartData = doc.data();

    // 2. Compute all live transits for this chart
    let allTransits = await getLiveTransits(chartData);

    // 3. Filter to only the transits relevant to the user's question
    const lowerQuestion = question.toLowerCase();
    // Match transits by planet name in question
    let relevantTransits = allTransits.filter(t =>
      lowerQuestion.includes(t.name.toLowerCase())
    );
    if (relevantTransits.length === 0) {
      relevantTransits = allTransits;
    }

    // 4. Interpret with the LLM, passing natal chart plus relevant transits
    const extendedChart = { ...chartData, transits: relevantTransits };
    const answer = await interpreter.interpretChartQuery(extendedChart, question, dialect);

    return res.json({ answer });
  } catch (err) {
    console.error('Error interpreting chart query:', err);
    return res.status(500).json({ error: err.message || 'Failed to interpret chart query.' });
  }
});

module.exports = router;