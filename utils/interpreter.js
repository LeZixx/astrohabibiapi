

const axios = require('axios');

// Replace with your actual Sonar API endpoint and key
const SONAR_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const SONAR_API_KEY = process.env.SONAR_API_KEY || 
async function interpretChart({ chartData, dialect = 'Modern Standard Arabic' }) {
  if (!chartData || !chartData.planets || !chartData.houses || !chartData.ascendant) {
    throw new Error('Incomplete chart data for interpretation');
  }

  const prompt = `
  You are a professional astrologer. Write a personal, spiritual, yet grounded astrological interpretation in ${dialect} for this birth chart:
  
  Ascendant: ${chartData.ascendant}
  Houses: ${JSON.stringify(chartData.houses)}
  Planets: ${chartData.planets.map(p => `${p.name} at ${p.longitude.toFixed(2)}°`).join(', ')}

  Focus on personality insights, life themes, and strengths. Keep it warm and wise, avoid technical jargon.
  `;

  try {
    const response = await axios.post(SONAR_ENDPOINT, {
      model: 'llama-3.1-sonar-large-128k-online', 
      messages: [
        { role: 'system', content: 'You are a professional astrologer.' },
        { role: 'user', content: prompt }
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