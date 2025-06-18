const express = require('express');
const router = express.Router();
const { getLiveTransits, filterRelevantTransits } = require('../utils/transitCalculator');
const { getLatestChart } = require('../utils/firestore');
const interpreter = require('../utils/interpreter');

// helper: decide if this question implies a transit-related query
function needsTransit(question) {
  const re = /\b(next|tomorrow|today|week|month|year|when|will|transit|move|affect|impact)\b/i;
  return re.test(question);
}

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

    // Extract the stored raw chart data
    const natalChart = latest.rawChartData || latest;
    
    console.log('📊 Retrieved natal chart from Firestore:');
    console.log(`  - Ascendant: ${natalChart.ascendant}`);
    console.log(`  - Houses: ${natalChart.houses?.length || 0}`);
    console.log(`  - Planets: ${natalChart.planets?.length || 0}`);
    
    // Verify the chart has proper planet data with house positions
    if (natalChart.planets && natalChart.planets.length > 0) {
      console.log('🪐 Sample planet data:');
      const samplePlanet = natalChart.planets[0];
      console.log(`  - ${samplePlanet.name}: ${samplePlanet.sign} (House ${samplePlanet.house})`);
    }

    // decide if we should compute transits
    const transitNeeded = needsTransit(question);
    let transitChart = [];
    let relevantTransits = [];

    if (transitNeeded) {
      // 2. Compute live transits for this chart
      try {
        const allTransits = await getLiveTransits(natalChart);
        console.log('🔎 All transits calculated:', allTransits.length);

        // 3. Filter transits relevant to the user's question
        relevantTransits = filterRelevantTransits(allTransits, question, natalChart);
        console.log('🎯 Relevant transits for question:', relevantTransits.length);
        
        // Keep full transit chart for reference
        transitChart = allTransits;
      } catch (transitErr) {
        console.error('❌ Transit calculation error:', transitErr);
        // Continue without transits rather than failing completely
        transitChart = [];
        relevantTransits = [];
      }
    }

    // 4. Prepare chart for interpretation
    const chartForLLM = transitNeeded
      ? { ...natalChart, transits: relevantTransits }
      : natalChart;

    // Use the dialect from the request, or fall back to the one stored in the chart
    const interpretDialect = dialect || natalChart.dialect || 'English';
    
    console.log('🔮 Sending to interpreter with dialect:', interpretDialect);
    console.log('📝 Question:', question);
    
    const answer = await interpreter.interpretChartQuery(
      chartForLLM,
      question,
      interpretDialect
    );

    const responsePayload = { 
      answer, 
      natalChart,
      chartId: latest.chartId,
      createdAt: latest.createdAt
    };
    
    if (transitNeeded) {
      responsePayload.transitChart = transitChart;
    }

    return res.json(responsePayload);
  } catch (err) {
    console.error('Error interpreting chart query:', err);
    return res.status(500).json({ error: err.message || 'Failed to interpret chart query.' });
  }
});

module.exports = router;