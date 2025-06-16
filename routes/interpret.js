const express = require('express');
const router = express.Router();
const { getLiveTransits } = require('../utils/transitCalculator');
const { getLatestChart } = require('../utils/firestore');
const interpreter = require('../utils/interpreter');

// Enhanced function to detect transit-related queries
function needsTransit(question) {
  const transitKeywords = [
    // Time-related
    'next', 'tomorrow', 'today', 'week', 'month', 'year', 'when', 'will',
    // Transit-specific
    'transit', 'transiting', 'move', 'moving', 'affect', 'impact', 'influence',
    // Predictive
    'future', 'upcoming', 'coming', 'soon', 'later', 'happening',
    // Current events
    'now', 'currently', 'present', 'this time',
    // Specific planetary movements
    'entering', 'leaving', 'conjunct', 'square', 'trine', 'opposite',
    // Questions about timing
    'good time', 'bad time', 'favorable', 'should i', 'best time'
  ];
  
  const lowerQuestion = question.toLowerCase();
  return transitKeywords.some(keyword => lowerQuestion.includes(keyword));
}

// Function to validate chart data completeness
function validateChartData(chartData) {
  const errors = [];
  
  if (!chartData) {
    errors.push('Chart data is missing');
    return { isValid: false, errors };
  }
  
  if (!Array.isArray(chartData.planets) || chartData.planets.length === 0) {
    errors.push('Planet positions are missing');
  } else {
    // Check for essential planets
    const requiredPlanets = ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN'];
    const foundPlanets = chartData.planets.map(p => p.name?.toUpperCase());
    
    requiredPlanets.forEach(planet => {
      if (!foundPlanets.includes(planet)) {
        errors.push(`Missing ${planet} position`);
      }
    });
    
    // Validate planetary positions
    chartData.planets.forEach(planet => {
      if (typeof planet.longitude !== 'number' || planet.longitude < 0 || planet.longitude >= 360) {
        errors.push(`Invalid longitude for ${planet.name}: ${planet.longitude}`);
      }
    });
  }
  
  // Validate birth info if available
  if (!chartData.birthDate && !chartData.date) {
    errors.push('Birth date is missing');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings: []
  };
}

// Enhanced logging for debugging
function logRequestDetails(userId, question, chartData, transitNeeded) {
  console.log('🔍 [INTERPRET] Request Details:');
  console.log(`  User ID: ${userId}`);
  console.log(`  Question: "${question}"`);
  console.log(`  Transit needed: ${transitNeeded}`);
  console.log(`  Chart has planets: ${Array.isArray(chartData?.planets)} (${chartData?.planets?.length || 0})`);
  console.log(`  Chart has houses: ${Array.isArray(chartData?.houses)} (${chartData?.houses?.length || 0})`);
  console.log(`  Chart has ascendant: ${typeof chartData?.ascendant === 'number'}`);
}

console.log('🎯 [routes/interpret] Enhanced POST /interpret route loaded');

router.post('/', async (req, res) => {
  try {
    const { userId, question, dialect } = req.body;
    
    if (!userId || !question) {
      return res.status(400).json({ 
        error: 'Request must include userId and question.',
        received: { userId: !!userId, question: !!question }
      });
    }

    console.log(`🔍 Processing interpretation for user: ${userId}`);
    console.log(`❓ Question: "${question}"`);

    // 1. Fetch stored natal chart from Firestore
    const latest = await getLatestChart(userId);
    if (!latest) {
      return res.status(404).json({ 
        error: 'Chart not found for this user. Please generate your natal chart first.',
        suggestion: 'Use /full-chart endpoint to create a natal chart first.'
      });
    }

    // Extract natal chart data with proper fallback
    const natalChart = latest.rawChartData || latest;
    
    // 2. Validate chart data
    const validation = validateChartData(natalChart);
    if (!validation.isValid) {
      console.error('❌ Invalid chart data:', validation.errors);
      return res.status(422).json({
        error: 'Invalid chart data found',
        details: validation.errors,
        chartData: natalChart // Include for debugging
      });
    }

    // 3. Determine if transits are needed
    const transitNeeded = needsTransit(question);
    
    // Enhanced logging
    logRequestDetails(userId, question, natalChart, transitNeeded);

    let transitChart = [];
    let enhancedChart = { ...natalChart };
    
    if (transitNeeded) {
      try {
        console.log('🌟 Computing current transits...');
        transitChart = await getLiveTransits(natalChart);
        console.log(`✅ Computed ${transitChart.length} current transits`);
        
        // Add transits to chart data for LLM
        enhancedChart.transits = transitChart;
        
        // Log sample transit for debugging
        if (transitChart.length > 0) {
          console.log('📍 Sample transit:', transitChart[0]);
        }
      } catch (transitError) {
        console.error('⚠️ Transit calculation failed:', transitError);
        // Continue without transits rather than failing completely
        transitNeeded = false;
      }
    }

    // 4. Ensure all required chart data is present
    enhancedChart = {
      ...enhancedChart,
      // Ensure birth details are included
      birthDate: enhancedChart.birthDate || latest.birthDate || 'Unknown',
      birthTime: enhancedChart.birthTime || latest.birthTime || 'Unknown', 
      birthPlace: enhancedChart.birthPlace || latest.birthPlace || 'Unknown',
      latitude: enhancedChart.latitude || latest.latitude,
      longitude: enhancedChart.longitude || latest.longitude
    };

    // 5. Generate interpretation using enhanced interpreter
    console.log('🤖 Sending to enhanced LLM interpreter...');
    const startTime = Date.now();
    
    const answer = await interpreter.interpretChartQuery(
      enhancedChart,
      question,
      dialect || 'English'
    );
    
    const interpretationTime = Date.now() - startTime;
    console.log(`✅ Interpretation completed in ${interpretationTime}ms`);

    // 6. Prepare comprehensive response
    const responsePayload = {
      answer,
      metadata: {
        queryType: transitNeeded ? 'transit_query' : 'natal_query',
        language: dialect || 'English',
        processingTime: interpretationTime,
        chartValidation: validation,
        transitCount: transitChart.length
      },
      // Include chart data for transparency (can be removed in production)
      debug: {
        natalChart: {
          planetsCount: enhancedChart.planets?.length || 0,
          hasHouses: Array.isArray(enhancedChart.houses),
          hasAscendant: typeof enhancedChart.ascendant === 'number',
          hasTransits: Array.isArray(enhancedChart.transits)
        }
      }
    };

    // Include transit data in response if calculated
    if (transitNeeded && transitChart.length > 0) {
      responsePayload.transitData = {
        computed: true,
        count: transitChart.length,
        sample: transitChart.slice(0, 3) // First 3 transits for debugging
      };
    }

    console.log('✅ Enhanced interpretation response ready');
    return res.json(responsePayload);

  } catch (err) {
    console.error('❌ Error in enhanced interpretation route:', err);
    
    // Detailed error response for debugging
    return res.status(500).json({ 
      error: 'Failed to interpret chart query.',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'enhanced-chart-interpreter',
    version: '2.0',
    features: ['structured_prompts', 'transit_integration', 'validation'],
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for chart validation
router.post('/validate', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    const latest = await getLatestChart(userId);
    if (!latest) {
      return res.status(404).json({ error: 'Chart not found' });
    }
    
    const chartData = latest.rawChartData || latest;
    const validation = validateChartData(chartData);
    
    return res.json({
      validation,
      chartSummary: {
        planetsCount: chartData.planets?.length || 0,
        hasHouses: Array.isArray(chartData.houses),
        hasAscendant: typeof chartData.ascendant === 'number',
        birthInfo: {
          date: chartData.birthDate || 'missing',
          time: chartData.birthTime || 'missing',
          place: chartData.birthPlace || 'missing'
        }
      }
    });
    
  } catch (err) {
    return res.status(500).json({ 
      error: 'Validation failed',
      details: err.message 
    });
  }
});

module.exports = router;