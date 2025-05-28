const axios = require('axios');

// Replace with your actual Sonar API endpoint and key
const SONAR_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const SONAR_API_KEY = process.env.SONAR_API_KEY;
const interpretChart = async ({ chartData, dialect = 'Modern Standard Arabic' }) => {
  if (!SONAR_API_KEY) {
    throw new Error('SONAR_API_KEY is not set; please set the env var before interpreting.');
  }
  if (!chartData || !chartData.planets || !chartData.houses || !chartData.ascendant) {
    throw new Error('Incomplete chart data for interpretation');
  }

  const summary = [
    `Ascendant: ${chartData.ascendant.toFixed(2)}`,
    `Houses cusps: ${chartData.houses.map((h,i) => `${i+1}st @ ${h.toFixed(2)}°`).join(', ')}`,
    `Planets: ${chartData.planets.map(p => {
       const sign = p.sign || 'unknown'; 
       const house = p.house || 'unknown';
       return `${p.name} in ${sign} (House ${house})`;
     }).join(', ')}`
  ].join('\n');

  try {
    const response = await axios.post(SONAR_ENDPOINT, {
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [
        { role: 'system', content: 'You are a professional, spiritual Arabic astrologer. Provide a warm, wise, and dialect-appropriate reading.' },
        { role: 'user', content: `Here is a birth-chart summary in English:\n${summary}\nNow generate a spiritual, dialect-appropriate Arabic reading of these placements.` }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${SONAR_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data?.choices?.[0]?.message?.content || 'No interpretation returned.';
  } catch (err) {
    console.error('🛑 Error calling Sonar:', err.response?.data || err.message);
    throw new Error('Failed to interpret chart with Sonar.');
  }
}

module.exports = { interpretChart };