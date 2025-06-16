const axios = require('axios');

console.log('🎯 [utils/interpreter] module loaded');

const SONAR_ENDPOINT = process.env.SONAR_ENDPOINT || 'https://api.perplexity.ai/chat/completions';
const SONAR_API_KEY = process.env.SONAR_API_KEY;

const ARABIC_SIGNS = ['الحمل','الثور','الجوزاء','السرطان','الأسد','العذراء','الميزان','العقرب','القوس','الجدي','الدلو','الحوت'];
const ENGLISH_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const FRENCH_SIGNS = ['Bélier', 'Taureau', 'Gémeaux', 'Cancer', 'Lion', 'Vierge', 'Balance', 'Scorpion', 'Sagittaire', 'Capricorne', 'Verseau', 'Poissons'];

function signDetails(lon) {
  const norm = ((lon % 360) + 360) % 360;
  const idx = Math.floor(norm / 30);
  const degree = Math.floor(norm % 30);
  const minutes = Math.floor(((norm % 30) - degree) * 60);
  return {
    idx,
    signAr: ARABIC_SIGNS[idx] || 'unknown',
    degree,
    minutes
  };
}

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
    const normLon = ((longitude % 360) + 360) % 360;
    const signIndex = Math.floor(normLon / 30);
    const degree = Math.floor(normLon % 30);
    const minutes = Math.floor(((normLon % 30) - degree) * 60);
    return {
      ...p,
      sign: {
        signAr: ARABIC_SIGNS[signIndex] || 'unknown'
      },
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
  console.log('🎯 [utils/interpreter] interpretChart called with dialect:', dialect, 'and chartData keys:', Object.keys(chartData || {}));
  
  const lang = (dialect || '').toLowerCase();
  
  // choose labels and sign array based on language
  let L;
  if (lang.startsWith('en')) {
    L = { ascLabel: 'Ascendant', housesLabel: 'Houses:', housePrefix: ' - House', planetsLabel: 'Planets:', aspectsNone: 'No major aspects.' };
  } else if (lang.startsWith('fr')) {
    L = { ascLabel: 'Ascendant', housesLabel: 'Maisons:', housePrefix: ' - Maison', planetsLabel: 'Planètes:', aspectsNone: 'Pas d\'aspects majeurs.' };
  } else {
    L = { ascLabel: 'الطالع', housesLabel: 'أوج البيوت:', housePrefix: ' - البيت', planetsLabel: 'الكواكب:', aspectsNone: 'لا توجد تأثيرات كبرى.' };
  }

  if (!SONAR_API_KEY) {
    throw new Error('SONAR_API_KEY is not set; please set the env var before interpreting.');
  }

  if (!chartData || !chartData.planets) {
    throw new Error('Incomplete chart data for interpretation');
  }

  const planetsWithPos = computePlanetPositions(chartData.planets);
  const planetsWithHouses = planetsWithPos.map(p => ({
    ...p,
    house: findHouse(p.longitude, chartData.houses)
  }));

  let summaryPrompt;

  if (chartData.houses && chartData.ascendant != null) {
    // Ascendant
    const ascDet = signDetails(chartData.ascendant);
    const ascSign = lang.startsWith('en')
      ? ENGLISH_SIGNS[ascDet.idx]
      : lang.startsWith('fr')
      ? FRENCH_SIGNS[ascDet.idx]
      : ascDet.signAr;
    const ascStr = `${ascDet.degree}°${ascDet.minutes}′ ${ascSign}`;

    // Houses
    const housesLines = chartData.houses.map((h, i) => {
      const d = signDetails(h);
      const signName = lang.startsWith('en')
        ? ENGLISH_SIGNS[d.idx]
        : lang.startsWith('fr')
        ? FRENCH_SIGNS[d.idx]
        : d.signAr;
      return `${L.housePrefix} ${i+1}: ${signName} ${d.degree}°${d.minutes}′`;
    });

    // Planets
    const planetsLines = planetsWithHouses.map(p => {
      const d = signDetails(p.longitude);
      const signName = lang.startsWith('en')
        ? ENGLISH_SIGNS[d.idx]
        : lang.startsWith('fr')
        ? FRENCH_SIGNS[d.idx]
        : d.signAr;
      const retro = p.retrograde ? (lang.startsWith('fr') ? ' (rétrograde)' : lang.startsWith('en') ? ' (retrograde)' : ' (رجعي)') : '';
      return `${L.housePrefix.replace('House','') === ' - ' ? p.name : p.name} ${lang.startsWith('en') ? 'in' : lang.startsWith('fr') ? 'en' : 'في'} ${signName} ${d.degree}°${d.minutes}′${retro} (${lang.startsWith('en') ? 'House' : lang.startsWith('fr') ? 'Maison' : 'البيت'} ${p.house})`;
    });

    // Aspects
    const aspects = findMajorAspects(planetsWithPos);
    const aspectsStr = aspects.length > 0
      ? `${L.aspectsNone.replace('No major aspects.','')} ${aspects.join(', ')}`
      : L.aspectsNone;

    summaryPrompt = [
      `${L.ascLabel}: ${ascStr}`,
      `${L.housesLabel}`,
      ...housesLines,
      `${L.planetsLabel}`,
      ...planetsLines,
      aspectsStr
    ].join('\n');
  } else {
    // fallback: no houses
    const aspects = findMajorAspects(planetsWithPos);
    const planetsSummary = planetsWithPos.map(p => {
      const degStr = `${p.degree}°${p.minutes}′`;
      return `${p.name} عند ${degStr} في ${p.sign.signAr}`;
    }).join(', ');
    const aspectsSummary = aspects.length > 0
      ? `التأثيرات: ${aspects.join(', ')}`
      : 'لا توجد تأثيرات كبرى.';
    summaryPrompt = [
      `الكواكب حسب البروج (بدون بيوت):`,
      planetsSummary,
      aspectsSummary
    ].join('\n');
  }

  console.log('summaryPrompt:', summaryPrompt);

  try {
    console.log('🕒 [interpreter] Sending prompt to Sonar at', new Date().toISOString());
    const t0 = Date.now();
    
    const response = await axios.post(SONAR_ENDPOINT, {
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [
        { role: 'system', content: 'You are a professional, spiritual Arabic astrologer. Provide a warm, wise, and dialect-appropriate reading.' },
        { role: 'user', content: `Here is a birth-chart summary in English:\n${summaryPrompt}\nPlease generate a spiritual, dialect-appropriate Arabic reading in ${dialect}.` }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${SONAR_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('🕒 [interpreter] Sonar returned at', new Date().toISOString(), 'elapsed (ms):', Date.now() - t0);
    
    return response.data?.choices?.[0]?.message?.content || 'No interpretation returned.';
  } catch (err) {
    console.error('🛑 Error calling Sonar:', err.response?.data || err.message);
    throw new Error('Failed to interpret chart with Sonar.');
  }
}

/**
 * Interpret live transits into readable sentences in Arabic, English, or French.
 * @param {Array} transits - Array of transit objects from getLiveTransits
 * @param {Object} chartData - Original natal chart data
 * @param {string} [dialect] - Language/dialect for output (optional)
 * @returns {string} Combined interpretation text
 */
function interpretTransits(transits, chartData, dialect = chartData.dialect || 'Arabic') {
  const lang = (dialect || '').toLowerCase();
  
  return transits.map(t => {
    let direction, sentence;
    
    switch (lang) {
      case 'english':
      case 'en':
        direction = t.isRetrograde ? 'retrograde' : 'direct';
        sentence = `${t.planet} ${t.aspect} ${t.with} with an orb of ${t.orb}°, ${direction}.`;
        break;
      case 'french':
      case 'fr':
        direction = t.isRetrograde ? 'rétrograde' : 'directe';
        sentence = `${t.planet} ${t.aspect} ${t.with} avec un écart de ${t.orb}°, ${direction}.`;
        break;
      default:
        direction = t.isRetrograde ? 'تراجعي' : 'متقدم';
        sentence = `${t.planet} ${t.aspect} ${t.with} بفارق ${t.orb}°، حركة ${direction}.`;
    }
    
    return sentence;
  }).join('\n');
}

/**
 * Interpret custom astrology questions using an LLM.
 * @param {Object} chartData - Natal chart and optional transits
 * @param {string} question - User's free-form question
 * @param {string} [dialect] - Language/dialect for response
 * @returns {Promise<string>} LLM-generated answer
 */
async function interpretChartQuery(chartData, question, dialect = chartData.dialect || 'English') {
  if (!SONAR_API_KEY) {
    throw new Error('SONAR_API_KEY is not set; please set the env var before interpreting.');
  }

  const langLabel = dialect.charAt(0).toUpperCase() + dialect.slice(1);
  
  // Format the chart data properly for the LLM
  let formattedChart = 'NATAL CHART:\n';
  
  // Add ascendant if available
  if (chartData.ascendant != null) {
    const ascDet = signDetails(chartData.ascendant);
    const signName = dialect.toLowerCase().startsWith('en') ? ENGLISH_SIGNS[ascDet.idx] :
                     dialect.toLowerCase().startsWith('fr') ? FRENCH_SIGNS[ascDet.idx] :
                     ARABIC_SIGNS[ascDet.idx];
    formattedChart += `Ascendant: ${signName} ${ascDet.degree}°${ascDet.minutes}′\n`;
  }
  
  // Add houses if available
  if (chartData.houses && Array.isArray(chartData.houses)) {
    formattedChart += '\nHOUSES:\n';
    chartData.houses.forEach((h, i) => {
      const hDet = signDetails(h);
      const signName = dialect.toLowerCase().startsWith('en') ? ENGLISH_SIGNS[hDet.idx] :
                       dialect.toLowerCase().startsWith('fr') ? FRENCH_SIGNS[hDet.idx] :
                       ARABIC_SIGNS[hDet.idx];
      formattedChart += `House ${i + 1}: ${signName} ${hDet.degree}°${hDet.minutes}′\n`;
    });
  }
  
  // Add planets with their actual house placements
  if (chartData.planets && Array.isArray(chartData.planets)) {
    formattedChart += '\nPLANETS:\n';
    chartData.planets.forEach(p => {
      const pDet = signDetails(p.longitude);
      const signName = dialect.toLowerCase().startsWith('en') ? ENGLISH_SIGNS[pDet.idx] :
                       dialect.toLowerCase().startsWith('fr') ? FRENCH_SIGNS[pDet.idx] :
                       ARABIC_SIGNS[pDet.idx];
      
      // Find actual house placement
      let houseNum = p.house;
      if (!houseNum && chartData.houses) {
        houseNum = findHouse(p.longitude, chartData.houses);
      }
      
      const retrograde = p.retrograde ? ' (Retrograde)' : '';
      formattedChart += `${p.name}: ${signName} ${pDet.degree}°${pDet.minutes}′${retrograde}`;
      if (houseNum) {
        formattedChart += ` in House ${houseNum}`;
      }
      formattedChart += '\n';
    });
  }
  
  // Add transits if available
  if (chartData.transits && Array.isArray(chartData.transits)) {
    formattedChart += '\nCURRENT TRANSITS:\n';
    chartData.transits.forEach(t => {
      const tDet = signDetails(t.currentLongitude);
      const signName = dialect.toLowerCase().startsWith('en') ? ENGLISH_SIGNS[tDet.idx] :
                       dialect.toLowerCase().startsWith('fr') ? FRENCH_SIGNS[tDet.idx] :
                       ARABIC_SIGNS[tDet.idx];
      const retrograde = t.retrograde ? ' (Retrograde)' : '';
      formattedChart += `${t.name}: ${signName} ${tDet.degree}°${tDet.minutes}′${retrograde}\n`;
      if (t.aspects && t.aspects.length > 0) {
        formattedChart += `  Aspects: ${t.aspects.join(', ')}\n`;
      }
    });
  }
  
  const systemMsg = {
    role: 'system',
    content: `You are a world-class expert astrologer. You must interpret the astrological data EXACTLY as provided - DO NOT make up or assume house placements. Only state house placements that are explicitly given in the chart data. Answer the user's question in a ${langLabel}-appropriate style, referencing their natal chart and any relevant current transits. Be accurate and specific about planetary positions and house placements.`
  };
  
  const userMsg = {
    role: 'user',
    content: `Question: ${question}\n\n${formattedChart}\n\nIMPORTANT: Only mention house placements that are explicitly stated in the chart data above. Do not assume or invent house placements.`
  };
  
  const response = await axios.post(SONAR_ENDPOINT, {
    model: 'llama-3.1-sonar-large-128k-online',
    messages: [systemMsg, userMsg]
  }, {
    headers: {
      'Authorization': `Bearer ${SONAR_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  return response.data?.choices?.[0]?.message?.content || 'No interpretation returned.';
}

module.exports = { interpretChart, interpretTransits, interpretChartQuery };