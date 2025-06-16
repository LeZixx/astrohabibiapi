const express = require('express');
const router = express.Router();
const { getLiveTransits } = require('../utils/transitCalculator');
const { getLatestChart } = require('../utils/firestore');
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
    const latest = await getLatestChart(userId);
    if (!latest) {
      return res.status(404).json({ error: 'Chart not found for this user.' });
    }
    // Extract the stored raw chart data (fallback if no rawChartData wrapper)
    const natalChart = latest.rawChartData || latest;

    // 2. Compute all live transits for this chart
    const transitChart = await getLiveTransits(natalChart);
    console.log('🔎 transitChart:', transitChart);

    // 3. Filter to only the transits relevant to the user's question
    const lowerQuestion = question.toLowerCase();
    // Match transits by planet name in question
    let relevantTransits = transitChart.filter(t =>
      lowerQuestion.includes(t.name.toLowerCase())
    );
    if (relevantTransits.length === 0) {
      relevantTransits = transitChart;
    }

    // 4. Interpret with the LLM, passing natal chart plus relevant transits
    const extendedChart = { ...natalChart, transits: relevantTransits };
    const answer = await interpreter.interpretChartQuery(extendedChart, question, dialect);

    return res.json({ answer, natalChart, transitChart });
  } catch (err) {
    console.error('Error interpreting chart query:', err);
    return res.status(500).json({ error: err.message || 'Failed to interpret chart query.' });
  }
});

module.exports = router;