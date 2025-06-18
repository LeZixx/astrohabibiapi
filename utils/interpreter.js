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
  if (!houses || !Array.isArray(houses)) return null;
  
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
  return null;
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

function findAllAspects(planets) {
  const aspects = [];
  const aspectTypes = [
    { name: 'Conjunction', angle: 0, orb: 8 },
    { name: 'Sextile', angle: 60, orb: 6 },
    { name: 'Square', angle: 90, orb: 8 },
    { name: 'Trine', angle: 120, orb: 8 },
    { name: 'Opposition', angle: 180, orb: 8 },
    { name: 'Semi-sextile', angle: 30, orb: 3 },
    { name: 'Semi-square', angle: 45, orb: 3 },
    { name: 'Sesquiquadrate', angle: 135, orb: 3 },
    { name: 'Quincunx', angle: 150, orb: 3 }
  ];

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      let diff = Math.abs(planets[i].longitude - planets[j].longitude);
      if (diff > 180) diff = 360 - diff;
      
      for (const aspectType of aspectTypes) {
        if (Math.abs(diff - aspectType.angle) <= aspectType.orb) {
          const orb = Math.abs(diff - aspectType.angle);
          aspects.push({
            planet1: planets[i].name,
            planet2: planets[j].name,
            type: aspectType.name,
            angle: aspectType.angle,
            orb: orb.toFixed(2),
            exact: diff.toFixed(2)
          });
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
  
  if (!SONAR_API_KEY) {
    throw new Error('SONAR_API_KEY is not set; please set the env var before interpreting.');
  }

  if (!chartData || !chartData.planets) {
    throw new Error('Incomplete chart data for interpretation');
  }

  const planetsWithPos = computePlanetPositions(chartData.planets);
  const planetsWithHouses = planetsWithPos.map(p => ({
    ...p,
    house: p.house || findHouse(p.longitude, chartData.houses)
  }));

  // Format detailed chart data for interpretation
  let detailedPrompt = 'NATAL CHART DETAILS:\n\n';

  // Ascendant
  if (chartData.ascendant != null) {
    const ascDet = signDetails(chartData.ascendant);
    const ascSign = lang.startsWith('en') ? ENGLISH_SIGNS[ascDet.idx] :
                    lang.startsWith('fr') ? FRENCH_SIGNS[ascDet.idx] :
                    ARABIC_SIGNS[ascDet.idx];
    detailedPrompt += `ASCENDANT: ${ascSign} ${ascDet.degree}°${ascDet.minutes}′\n\n`;
  }

  // Houses - one by one
  if (chartData.houses && Array.isArray(chartData.houses)) {
    detailedPrompt += 'HOUSES:\n';
    chartData.houses.forEach((h, i) => {
      const hDet = signDetails(h);
      const signName = lang.startsWith('en') ? ENGLISH_SIGNS[hDet.idx] :
                       lang.startsWith('fr') ? FRENCH_SIGNS[hDet.idx] :
                       ARABIC_SIGNS[hDet.idx];
      detailedPrompt += `House ${i + 1}: ${signName} ${hDet.degree}°${hDet.minutes}′\n`;
    });
    detailedPrompt += '\n';
  }

  // Planets - one by one with house placements
  detailedPrompt += 'PLANETS:\n';
  planetsWithHouses.forEach(p => {
    const pDet = signDetails(p.longitude);
    const signName = lang.startsWith('en') ? ENGLISH_SIGNS[pDet.idx] :
                     lang.startsWith('fr') ? FRENCH_SIGNS[pDet.idx] :
                     ARABIC_SIGNS[pDet.idx];
    const retro = p.retrograde ? ' (Retrograde)' : '';
    detailedPrompt += `${p.name}: ${signName} ${pDet.degree}°${pDet.minutes}′${retro}`;
    if (p.house) {
      detailedPrompt += ` in House ${p.house}`;
    }
    detailedPrompt += '\n';
  });
  detailedPrompt += '\n';

  // Aspects - all aspects with orbs
  const allAspects = findAllAspects(planetsWithPos);
  if (allAspects.length > 0) {
    detailedPrompt += 'ASPECTS:\n';
    allAspects.forEach(asp => {
      detailedPrompt += `${asp.planet1} ${asp.type} ${asp.planet2} (orb: ${asp.orb}°)\n`;
    });
  }

  console.log('Detailed prompt for interpretation:', detailedPrompt);

  try {
    console.log('🕒 [interpreter] Sending prompt to Sonar at', new Date().toISOString());
    const t0 = Date.now();
    
    const systemPrompt = lang.startsWith('en') ? 
      'You are a professional astrologer. Provide a detailed, structured interpretation following this exact format:\n\n1. ASCENDANT: Explain the rising sign and its significance\n\n2. HOUSES (1-12): For each house, explain:\n- Which sign rules it\n- What life area it represents\n- What this placement means for the native\n\n3. PLANETS: For each planet, explain:\n- Its sign placement\n- Its house placement\n- What this combination means\n\n4. ASPECTS: For each aspect, explain:\n- The nature of the aspect (harmonious/challenging)\n- How these two planets interact\n- The practical implications\n\nBe specific and detailed for each placement.' :
      lang.startsWith('fr') ?
      'Vous êtes un astrologue professionnel. Fournissez une interprétation détaillée et structurée en suivant ce format exact:\n\n1. ASCENDANT: Expliquez le signe ascendant et sa signification\n\n2. MAISONS (1-12): Pour chaque maison, expliquez:\n- Quel signe la gouverne\n- Quel domaine de vie elle représente\n- Ce que ce placement signifie pour le natif\n\n3. PLANÈTES: Pour chaque planète, expliquez:\n- Son placement en signe\n- Son placement en maison\n- Ce que cette combinaison signifie\n\n4. ASPECTS: Pour chaque aspect, expliquez:\n- La nature de l\'aspect (harmonieux/difficile)\n- Comment ces deux planètes interagissent\n- Les implications pratiques\n\nSoyez spécifique et détaillé pour chaque placement.' :
      'أنت منجم محترف. قدم تفسيرًا مفصلاً ومنظمًا باتباع هذا التنسيق بالضبط:\n\n1. الطالع: اشرح الطالع وأهميته\n\n2. البيوت (1-12): لكل بيت، اشرح:\n- أي برج يحكمه\n- أي مجال من مجالات الحياة يمثل\n- ماذا يعني هذا الموضع للمولود\n\n3. الكواكب: لكل كوكب، اشرح:\n- موضعه في البرج\n- موضعه في البيت\n- ماذا يعني هذا المزيج\n\n4. التأثيرات: لكل تأثير، اشرح:\n- طبيعة التأثير (متناغم/صعب)\n- كيف يتفاعل هذان الكوكبان\n- التطبيقات العملية\n\nكن محددًا ومفصلاً لكل موضع.';

    const userPrompt = lang.startsWith('en') ?
      `Please provide a detailed interpretation of this natal chart in English:\n\n${detailedPrompt}` :
      lang.startsWith('fr') ?
      `Veuillez fournir une interprétation détaillée de ce thème natal en français:\n\n${detailedPrompt}` :
      `يرجى تقديم تفسير مفصل لهذه الخريطة الفلكية بالعربية:\n\n${detailedPrompt}`;
    
    const response = await axios.post(SONAR_ENDPOINT, {
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
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
 * Interpret live transits into readable sentences
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
 * Interpret custom astrology questions using an LLM with detailed analysis
 */
async function interpretChartQuery(chartData, question, dialect = chartData.dialect || 'English') {
  if (!SONAR_API_KEY) {
    throw new Error('SONAR_API_KEY is not set; please set the env var before interpreting.');
  }

  const langLabel = dialect.charAt(0).toUpperCase() + dialect.slice(1);
  const lang = dialect.toLowerCase();
  
  // Format the chart data with complete details
  let formattedChart = 'COMPLETE NATAL CHART:\n\n';
  
  // Add ascendant if available
  if (chartData.ascendant != null) {
    const ascDet = signDetails(chartData.ascendant);
    const signName = lang.startsWith('en') ? ENGLISH_SIGNS[ascDet.idx] :
                     lang.startsWith('fr') ? FRENCH_SIGNS[ascDet.idx] :
                     ARABIC_SIGNS[ascDet.idx];
    formattedChart += `ASCENDANT: ${signName} ${ascDet.degree}°${ascDet.minutes}′\n\n`;
  }
  
  // Add all 12 houses
  if (chartData.houses && Array.isArray(chartData.houses)) {
    formattedChart += 'HOUSES (all 12):\n';
    chartData.houses.forEach((h, i) => {
      const hDet = signDetails(h);
      const signName = lang.startsWith('en') ? ENGLISH_SIGNS[hDet.idx] :
                       lang.startsWith('fr') ? FRENCH_SIGNS[hDet.idx] :
                       ARABIC_SIGNS[hDet.idx];
      formattedChart += `House ${i + 1}: ${signName} ${hDet.degree}°${hDet.minutes}′\n`;
    });
    formattedChart += '\n';
  }
  
  // Add all planets with their exact positions
  if (chartData.planets && Array.isArray(chartData.planets)) {
    formattedChart += 'PLANETS (complete list):\n';
    chartData.planets.forEach(p => {
      const pDet = signDetails(p.longitude);
      const signName = lang.startsWith('en') ? ENGLISH_SIGNS[pDet.idx] :
                       lang.startsWith('fr') ? FRENCH_SIGNS[pDet.idx] :
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
    formattedChart += '\n';
  }
  
  // Calculate and add ALL aspects
  if (chartData.planets && Array.isArray(chartData.planets)) {
    const allAspects = findAllAspects(chartData.planets);
    if (allAspects.length > 0) {
      formattedChart += 'ASPECTS (complete list with orbs):\n';
      allAspects.forEach(asp => {
        formattedChart += `${asp.planet1} ${asp.type} ${asp.planet2} (orb: ${asp.orb}°)\n`;
      });
      formattedChart += '\n';
    }
  }
  
  // Add transits if available - with detailed formatting for focused interpretation
  if (chartData.transits && Array.isArray(chartData.transits)) {
    formattedChart += 'RELEVANT CURRENT TRANSITS:\n';
    chartData.transits.forEach(t => {
      const tDet = signDetails(t.currentLongitude);
      const signName = lang.startsWith('en') ? ENGLISH_SIGNS[tDet.idx] :
                       lang.startsWith('fr') ? FRENCH_SIGNS[tDet.idx] :
                       ARABIC_SIGNS[tDet.idx];
      const retrograde = t.retrograde ? ' (Retrograde)' : '';
      
      formattedChart += `\nTransiting ${t.name}:\n`;
      formattedChart += `  - Currently in ${signName} ${t.degree}°${t.minutes}′${retrograde}\n`;
      formattedChart += `  - Transiting through House ${t.currentHouse}\n`;
      
      if (t.aspects && t.aspects.length > 0) {
        formattedChart += `  - Aspects:\n`;
        t.aspects.forEach(asp => {
          const applying = asp.applying ? 'applying' : 'separating';
          formattedChart += `    * ${asp.type} to natal ${asp.with} in ${asp.natalSign} (House ${asp.natalHouse}), orb ${asp.orb}°, ${applying}\n`;
        });
      }
    });
    formattedChart += '\n';
  }
  
  const structuredPrompt = lang.startsWith('en') ?
    'IMPORTANT: When interpreting transits for the user\'s question:\n1. Focus ONLY on the relevant transits provided\n2. Explain which houses are being activated by these transits\n3. Explain the timing implications (applying vs separating aspects)\n4. Be specific about how these transits answer their question\n5. Do NOT mention irrelevant transits or general interpretations\n\nFor natal chart questions:\n1. Explain each house placement individually (Houses 1-12)\n2. Explain each planet placement individually (not grouped)\n3. Explain each aspect individually with its meaning\n4. Be detailed and specific for each placement\n\nDo NOT group planets together (e.g., "Sun, Mercury and Venus in Libra"). Each planet must be explained separately.' :
    lang.startsWith('fr') ?
    'IMPORTANT: Lors de l\'interprétation des transits pour la question:\n1. Concentrez-vous UNIQUEMENT sur les transits pertinents fournis\n2. Expliquez quelles maisons sont activées par ces transits\n3. Expliquez les implications temporelles (aspects appliquants vs séparants)\n4. Soyez spécifique sur la façon dont ces transits répondent à la question\n5. NE mentionnez PAS les transits non pertinents ou les interprétations générales\n\nPour les questions sur le thème natal:\n1. Expliquer chaque placement de maison individuellement (Maisons 1-12)\n2. Expliquer chaque placement de planète individuellement (pas groupé)\n3. Expliquer chaque aspect individuellement avec sa signification\n4. Être détaillé et spécifique pour chaque placement\n\nNE PAS regrouper les planètes (ex: "Soleil, Mercure et Vénus en Balance"). Chaque planète doit être expliquée séparément.' :
    'مهم: عند تفسير العبور للسؤال:\n1. ركز فقط على العبور ذات الصلة المقدمة\n2. اشرح أي بيوت يتم تفعيلها بواسطة هذه العبور\n3. اشرح الآثار الزمنية (التأثيرات المقتربة مقابل المنفصلة)\n4. كن محددًا حول كيفية إجابة هذه العبور على السؤال\n5. لا تذكر العبور غير ذات الصلة أو التفسيرات العامة\n\nللأسئلة عن الخريطة الأصلية:\n1. شرح كل موضع بيت على حدة (البيوت 1-12)\n2. شرح كل موضع كوكب على حدة (غير مجمّع)\n3. شرح كل تأثير على حدة مع معناه\n4. كن مفصلاً ومحددًا لكل موضع\n\nلا تجمع الكواكب معًا (مثل: "الشمس وعطارد والزهرة في الميزان"). يجب شرح كل كوكب بشكل منفصل.';
  
  // Check if this is a transit question
  const isTransitQuestion = chartData.transits && chartData.transits.length > 0;
  
  const focusedPrompt = isTransitQuestion ? 
    (lang.startsWith('en') ? 
      '\n\nThis is a TRANSIT question. Focus your interpretation on:\n1. The specific transits provided and their current influence\n2. Which natal houses and planets are being activated\n3. The timing of events based on applying/separating aspects\n4. A direct answer to their specific question based on these transits' :
     lang.startsWith('fr') ?
      '\n\nC\'est une question de TRANSIT. Concentrez votre interprétation sur:\n1. Les transits spécifiques fournis et leur influence actuelle\n2. Quelles maisons et planètes natales sont activées\n3. Le timing des événements basé sur les aspects appliquants/séparants\n4. Une réponse directe à leur question spécifique basée sur ces transits' :
      '\n\nهذا سؤال عن العبور. ركز تفسيرك على:\n1. العبور المحددة المقدمة وتأثيرها الحالي\n2. أي بيوت وكواكب أصلية يتم تفعيلها\n3. توقيت الأحداث بناءً على التأثيرات المقتربة/المنفصلة\n4. إجابة مباشرة على سؤالهم المحدد بناءً على هذه العبور') : '';
  
  const systemMsg = {
    role: 'system',
    content: `You are a world-class expert astrologer providing detailed interpretations in ${langLabel}. ${structuredPrompt}${focusedPrompt}

CRITICAL INSTRUCTIONS:
1. You MUST use ONLY the astrological data provided in the user's message
2. DO NOT use any external astrological knowledge or ephemeris data  
3. DO NOT make up planetary positions, house placements, or transit dates
4. DO NOT reference generic astrological events unless they are explicitly provided in the data
5. If a planet's house position is not provided in the data, say "house position not specified"
6. If transit dates are not provided in the data, do not mention specific dates
7. ONLY interpret what is explicitly given to you - nothing else
8. If you find yourself referencing information not in the provided chart data, STOP and only use what's given

This is absolutely essential - any hallucinated information will be considered a critical error.`
  };
  
  const userMsg = {
    role: 'user',
    content: `Question: ${question}\n\n${formattedChart}\n\nIMPORTANT: Base your interpretation SOLELY on the chart data provided above. Do not use external astrological knowledge, ephemeris data, or online sources. Only interpret what is explicitly shown in the data provided.\n\nPlease provide a detailed interpretation addressing the question while explaining each placement individually.`
  };
  
  const response = await axios.post(SONAR_ENDPOINT, {
    model: 'llama-3.1-sonar-small-128k-online',
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