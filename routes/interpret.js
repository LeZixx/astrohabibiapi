const express = require('express');
const router = express.Router();
const { getLiveTransits, filterRelevantTransits } = require('../utils/transitCalculator');
const { getLatestChart, getConversationHistory } = require('../utils/firestore');
const interpreter = require('../utils/interpreter');

// helper: decide if this question implies a transit-related query
function needsTransit(question) {
  const re = /\b(next|tomorrow|today|week|month|year|when|will|transit|move|affect|impact|july|august|september|october|november|december|january|february|march|april|may|june|2025|2026|2027|looking|launch|start|begin|future|upcoming|coming)\b/i;
  return re.test(question);
}

console.log('🔍 interpretChartQuery import:', require('../utils/interpreter'));
console.log('🎯 [routes/interpret] POST /interpret route loaded');

router.post('/', async (req, res) => {
  try {
    const { userId, question, dialect, conversationHistory } = req.body;
    
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

    // Check if this is a pure natal chart interpretation vs a transit question
    const isPureNatalQuestion = question.toLowerCase().includes('natal chart') || 
                               question.toLowerCase().includes('spiritual interpretation');
    
    const transitNeeded = isPureNatalQuestion ? false : needsTransit(question);
    console.log('🔍 Question analysis:', { question, isPureNatalQuestion, transitNeeded });
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
    console.log('🏠 Chart data being sent to LLM:');
    console.log('  - Ascendant:', chartForLLM.ascendant);
    console.log('  - Houses:', chartForLLM.houses);
    console.log('  - Planets count:', chartForLLM.planets?.length);
    if (chartForLLM.planets && chartForLLM.planets.length > 0) {
      console.log('  - Sample planets:');
      chartForLLM.planets.slice(0, 3).forEach(p => {
        console.log(`    * ${p.name}: ${p.longitude}° (${p.sign || 'no sign'}) in House ${p.house || 'unknown'}`);
      });
    }
    if (chartForLLM.transits) {
      console.log('  - Transits count:', chartForLLM.transits.length);
      if (chartForLLM.transits.length > 0) {
        console.log('  - Sample transits:');
        chartForLLM.transits.slice(0, 2).forEach(t => {
          console.log(`    * ${t.name}: ${t.currentLongitude}° currently in House ${t.currentHouse}`);
        });
      }
    }
    
    // Load persistent conversation history if not provided in request
    let finalConversationHistory = conversationHistory;
    if (!conversationHistory || conversationHistory.length === 0) {
      try {
        finalConversationHistory = await getConversationHistory(userId, 20, 30);
        console.log(`💬 Loaded ${finalConversationHistory.length} persistent conversation messages for ${userId}`);
      } catch (error) {
        console.error('❌ Failed to load persistent conversation history:', error.message);
        finalConversationHistory = [];
      }
    }
    
    console.log('🔍 Final conversation history length:', finalConversationHistory ? finalConversationHistory.length : 0);
    
    const answer = await interpreter.interpretChartQuery(
      chartForLLM,
      question,
      interpretDialect,
      finalConversationHistory
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
    console.error('❌ Error interpreting chart query:', err);
    console.error('🔍 Error details:', {
      message: err.message,
      stack: err.stack?.split('\n')[0],
      userId: req.body.userId,
      questionLength: question?.length,
      hasConversationHistory: !!conversationHistory,
      conversationHistoryLength: conversationHistory?.length
    });
    return res.status(500).json({ 
      error: err.message || 'Failed to interpret chart query.',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

module.exports = router;