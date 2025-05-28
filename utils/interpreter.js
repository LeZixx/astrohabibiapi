const axios = require('axios');

// Replace with your actual Sonar API endpoint and key
const SONAR_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const SONAR_API_KEY = process.env.SONAR_API_KEY;

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

function findHouse(longitude, houses) {
  for (let i = 0; i < houses.length; i++) {
    const start = houses[i];
    const end = houses[(i + 1) % houses.length];
    if (start < end) {
      if (longitude >= start && longitude < end) return i + 1;
    } else {
      // wrap around 360°
      if (longitude >= start || longitude < end) return i + 1;
    }
  }
  return undefined;
}

function computePlanetPositions(planets) {
  return planets.map(p => {
    const longitude = p.longitude;
    const signIndex = Math.floor(longitude / 30);
    const degree = Math.floor(longitude % 30);
    const minutes = Math.floor(((longitude % 30) - degree) * 60);
    return {
      ...p,
      sign: SIGNS[signIndex] || 'unknown',
      degree,
      minutes
    };
  });
}

function findMajorAspects(planets) {
  const aspects = [];
  const aspectAngles = [
    { name: 'Conjunction', angle: 0 },
    { name: 'Sextile', angle: 60 },
    { name: 'Square', angle: 90 },
    { name: 'Trine', angle: 120 },
    { name: 'Opposition', angle: 180 }
  ];
  const orb = 2;

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      let diff = Math.abs(planets[i].longitude - planets[j].longitude);
      if (diff > 180) diff = 360 - diff;
      for (const aspect of aspectAngles) {
        if (Math.abs(diff - aspect.angle) <= orb) {
          aspects.push(`${planets[i].name} ${aspect.name} ${planets[j].name}`);
          break;
        }
      }
    }
  }
  return aspects;
}

const interpretChart = async ({ chartData, dialect = 'Modern Standard Arabic' }) => {
  if (!SONAR_API_KEY) {
    throw new Error('SONAR_API_KEY is not set; please set the env var before interpreting.');
  }
  if (!chartData || !chartData.planets || !chartData.houses || !chartData.ascendant) {
    throw new Error('Incomplete chart data for interpretation');
  }

  const planetsWithPos = computePlanetPositions(chartData.planets);
  const planetsWithHouses = planetsWithPos.map(p => ({
    ...p,
    house: findHouse(p.longitude, chartData.houses)
  }));
  const aspects = findMajorAspects(planetsWithHouses);

  const planetsSummary = planetsWithHouses.map(p => {
    const degStr = `${p.degree}°${p.minutes}′`;
    const house = p.house || 'unknown';
    return `${p.name} at ${degStr} ${p.sign} (House ${house})`;
  }).join(', ');

  const aspectsSummary = aspects.length > 0 ? `Aspects: ${aspects.join(', ')}` : 'No major aspects detected.';

  const summaryPrompt = [
    `Ascendant: ${chartData.ascendant.toFixed(2)}`,
    `Houses cusps: ${chartData.houses.map((h,i) => `${i+1}st @ ${h.toFixed(2)}°`).join(', ')}`,
    `Planets: ${planetsSummary}`,
    aspectsSummary
  ].join('\n');

  console.log('summaryPrompt:', summaryPrompt);

  try {
    const response = await axios.post(SONAR_ENDPOINT, {
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [
        { role: 'system', content: 'You are a professional, spiritual Arabic astrologer. Provide a warm, wise, and dialect-appropriate reading.' },
        { role: 'user', content: `Here is a birth-chart summary in English:\n${summaryPrompt}\nNow generate a spiritual, dialect-appropriate Arabic reading of these placements.` }
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