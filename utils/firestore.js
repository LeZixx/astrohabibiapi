const express = require('express');
const admin = require('firebase-admin');
const router = express.Router();
const { getLatestChart } = require('../utils/firestore');
const { getLiveTransits } = require('../utils/transitCalculator');
const interpreter = require('../utils/interpreter');

router.post('/interpret', async (req, res) => {
  const { userId, question } = req.body;

  if (!userId || !question) {
    return res.status(400).json({ error: 'Missing userId or question' });
  }

  // Fetch the latest natal chart for the user
  const chartData = await getLatestChart(userId);
  if (!chartData) {
    return res.status(404).json({ error: 'No natal chart found for user' });
  }

  // Compute relevant transits (fallback logic)
  const relevantTransits = await computeRelevantTransits(chartData.rawChartData);

  // Persist transit chart in Firestore for later reference
  try {
    await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('transits')
      .add({
        transits: relevantTransits,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch (fsErr) {
    console.warn('⚠️ Failed to save transit chart to Firestore:', fsErr);
  }

  // Generate an answer based on question and transit chart
  const answer = await generateAnswer(
    question,
    relevantTransits,
    chartData.rawChartData,
    chartData.dialect || 'English'
  );

  return res.json({
    answer,
    natalChart: chartData,
    transitChart: relevantTransits
  });
});

async function computeRelevantTransits(natalChartData) {
  return await getLiveTransits(natalChartData);
}

async function generateAnswer(question, transits, natalChartData, dialect) {
  const extendedChart = { ...natalChartData, transits };
  return await interpreter.interpretChartQuery(extendedChart, question, dialect);
}

module.exports = router;