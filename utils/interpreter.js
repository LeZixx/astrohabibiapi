const axios = require('axios');

console.log('🎯 [utils/interpreter] module loaded');

const SONAR_ENDPOINT = process.env.SONAR_ENDPOINT || 'https://api.perplexity.ai/chat/completions';
const SONAR_API_KEY = process.env.SONAR_API_KEY;

const ARABIC_SIGNS = ['الحمل','الثور','الجوزاء','السرطان','الأسد','العذراء','الميزان','العقرب','القوس','الجدي','الدلو','الحوت'];
const ENGLISH_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const FRENCH_SIGNS = ['Bélier', 'Taureau', 'Gémeaux', 'Cancer', 'Lion', 'Vierge', 'Balance', 'Scorpion', 'Sagittaire', 'Capricorne', 'Verseau', 'Poissons'];

function signDetails(lon) {
  // Validate input
  if (typeof lon !== 'number' || isNaN(lon) || lon === null || lon === undefined) {
    console.warn('⚠️ Invalid longitude value passed to signDetails:', lon);
    return {
      idx: 0,
      signAr: 'unknown',
      degree: 0,
      minutes: 0
    };
  }
  
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

function degreeToSign(lon) {
  // Validate input
  if (typeof lon !== 'number' || isNaN(lon) || lon === null || lon === undefined) {
    console.warn('⚠️ Invalid longitude value passed to degreeToSign:', lon);
    return 'Unknown';
  }
  
  const norm = ((lon % 360) + 360) % 360;
  const idx = Math.floor(norm / 30);
  return ENGLISH_SIGNS[idx] || 'unknown';
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
        // Calculate dynamic orb based on planet types
        let dynamicOrb = aspectType.orb;
        
        // Use tighter orbs for fixed stars and asteroids
        const planet1Type = planets[i].type || 'planet';
        const planet2Type = planets[j].type || 'planet';
        
        if (planet1Type === 'fixed_star' || planet2Type === 'fixed_star') {
          // Very tight orbs for fixed stars (1-2°)
          dynamicOrb = Math.min(aspectType.orb, aspectType.angle === 0 ? 1.5 : 1.0);
        } else if (planet1Type === 'asteroid' || planet2Type === 'asteroid') {
          // Tight orbs for asteroids (2-3°)
          dynamicOrb = Math.min(aspectType.orb, aspectType.angle === 0 ? 3.0 : 2.5);
        }
        
        if (Math.abs(diff - aspectType.angle) <= dynamicOrb) {
          const orb = Math.abs(diff - aspectType.angle);
          aspects.push({
            planet1: planets[i].name,
            planet2: planets[j].name,
            type: aspectType.name,
            angle: aspectType.angle,
            orb: orb.toFixed(2),
            exact: diff.toFixed(2),
            dynamicOrb: dynamicOrb.toFixed(1),
            involvesStar: planet1Type === 'fixed_star' || planet2Type === 'fixed_star',
            involvesAsteroid: planet1Type === 'asteroid' || planet2Type === 'asteroid'
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
      'You are a professional astrologer. Provide a comprehensive, detailed interpretation following this exact format:\n\n1. ASCENDANT: Explain the rising sign and its significance\n\n2. PLANETARY PLACEMENTS: For EACH planet individually, provide a detailed explanation:\n- Planet name (e.g., "The Sun in Libra in House 11")\n- What this planet represents (core meaning)\n- What the sign placement means\n- What the house placement means\n- How the sign + house combination works together\n- Practical implications for daily life\n\n3. ASPECTS: For significant aspects, explain:\n- The nature of the aspect (harmonious/challenging)\n- How these planets interact\n- The practical implications\n\n4. SPIRITUAL INSIGHTS: Provide practical spiritual guidance\n\nIMPORTANT: Explain EVERY planet placement in detail. Do not group planets together. Each planet gets its own dedicated explanation.' :
      lang.startsWith('fr') ?
      'Vous êtes un astrologue professionnel. Fournissez une interprétation détaillée et structurée en suivant ce format exact:\n\n1. ASCENDANT: Expliquez le signe ascendant et sa signification\n\n2. MAISONS (1-12): Pour chaque maison, expliquez:\n- Quel signe la gouverne\n- Quel domaine de vie elle représente\n- Ce que ce placement signifie pour le natif\n\n3. PLANÈTES: Pour chaque planète, expliquez:\n- Son placement en signe\n- Son placement en maison\n- Ce que cette combinaison signifie\n\n4. ASPECTS: Pour chaque aspect, expliquez:\n- La nature de l\'aspect (harmonieux/difficile)\n- Comment ces deux planètes interagissent\n- Les implications pratiques\n\nSoyez spécifique et détaillé pour chaque placement.' :
      'أنت منجم محترف. قدم تفسيرًا مفصلاً ومنظمًا باتباع هذا التنسيق بالضبط:\n\n1. الطالع: اشرح الطالع وأهميته\n\n2. البيوت (1-12): لكل بيت، اشرح:\n- أي برج يحكمه\n- أي مجال من مجالات الحياة يمثل\n- ماذا يعني هذا الموضع للمولود\n\n3. الكواكب: لكل كوكب، اشرح:\n- موضعه في البرج\n- موضعه في البيت\n- ماذا يعني هذا المزيج\n\n4. التأثيرات: لكل تأثير، اشرح:\n- طبيعة التأثير (متناغم/صعب)\n- كيف يتفاعل هذان الكوكبان\n- التطبيقات العملية\n\nكن محددًا ومفصلاً لكل موضع.';

    const userPrompt = lang.startsWith('en') ?
      `Please provide a detailed interpretation of this natal chart in English:\n\n${detailedPrompt}` :
      lang.startsWith('fr') ?
      `Veuillez fournir une interprétation détaillée de ce thème natal en français:\n\n${detailedPrompt}` :
      `يرجى تقديم تفسير مفصل لهذه الخريطة الفلكية بالعربية:\n\n${detailedPrompt}`;
    
    const response = await axios.post(SONAR_ENDPOINT, {
      model: 'llama-3.1-sonar-large-128k-online',
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
async function interpretChartQuery(chartData, question, dialect = chartData.dialect || 'English', conversationHistory = []) {
  if (!SONAR_API_KEY) {
    throw new Error('SONAR_API_KEY is not set; please set the env var before interpreting.');
  }

  const langLabel = dialect.charAt(0).toUpperCase() + dialect.slice(1);
  const lang = dialect.toLowerCase();
  
  console.log('🔍 interpretChartQuery input:', {
    hasChartData: !!chartData,
    hasQuestion: !!question,
    planetsCount: chartData?.planets?.length,
    dialect,
    conversationHistoryLength: conversationHistory?.length
  });
  
  // Check for problematic data in planets
  if (chartData?.planets) {
    try {
      const testSerialization = JSON.stringify(chartData.planets);
      console.log('✅ Planets data serializes OK, length:', testSerialization.length);
    } catch (e) {
      console.error('❌ Planets data serialization failed:', e.message);
      throw new Error('Chart data contains non-serializable objects');
    }
  }
  
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
    content: `You are a warm, spiritual astrologer speaking directly to someone about their natal chart in ${langLabel}. You're like a wise, intuitive friend who deeply understands astrology and human nature.

CRITICAL FORMATTING RULES:
- Use NO markdown formatting (no ###, ####, **, etc.) - write in plain text only
- Address the person directly using "you" and "your" - never say "this individual" or "the native"
- Be personal, warm, and spiritual in your approach
- Write as if you're having an intimate conversation with a friend

INTELLIGENCE AND FLEXIBILITY:
- READ the user's question and understand what they're truly asking about
- Whether they ask about stelliums, aspects, planets, houses, or spiritual insights - answer intelligently
- Don't be rigid - let your astrological knowledge guide you to give them exactly what they need
- If they ask about stelliums, identify clusters of planets in their chart and explain the significance
- If they ask about specific aspects, focus on those but connect them to their life experience
- Always relate everything back to their personal journey and growth

FOR COMPLETE NATAL INTERPRETATIONS:
- ALWAYS include both sign AND house for each planet (e.g. "Your Sun in Libra in the 11th house...")
- Explain what each house represents and how the planet manifests in that life area
- Don't skip houses - they're crucial for understanding how planetary energy expresses in daily life

CRITICAL FOR FOLLOW-UP QUESTIONS:
- If this is a follow-up question (you can see our previous conversation), answer ONLY their specific question
- DO NOT reinterpret the entire chart again
- DO NOT repeat information you've already given
- Focus solely on what they're asking about now
- Use the chart data from our conversation history - you don't need it repeated

TONE AND STYLE:
- Speak warmly and personally: "Your Sun in Libra shows that you..." not "This placement indicates..."
- Use spiritual language: "Your soul chose this placement to learn..." 
- Ask rhetorical questions: "Have you noticed how you naturally seek harmony?"
- Offer guidance: "This suggests you might find fulfillment through..."
- Be encouraging and insightful, not clinical or detached
- Connect the dots between different parts of their chart naturally

ASTROLOGICAL FOUNDATION:
1. You MUST use ONLY the exact astrological data provided in the user's message
2. All planetary positions, aspects, and calculations must be based on the provided data
3. DO NOT make up any astrological positions or dates not in the data
4. If information is missing, acknowledge it naturally: "I'd need to see your full chart to tell you more about..."

Remember: You're an intelligent astrologer who can answer ANY astrological question about their chart. Use your wisdom to give them exactly what they're seeking.`
  };
  
  // Detect if this is a specific reference question
  const isSpecificReference = question.toLowerCase().includes('insight') || 
                             question.toLowerCase().includes('aspect') ||
                             question.toLowerCase().includes('elaborate') ||
                             question.toLowerCase().includes('explain more');
  
  // Check if this is a natal chart interpretation vs follow-up question
  const isNatalChartInterpretation = question.toLowerCase().includes('spiritual interpretation') || 
                                   question.toLowerCase().includes('natal chart');
  const hasConversationHistory = conversationHistory && conversationHistory.length > 0;
  
  const userMsg = {
    role: 'user',
    content: (hasConversationHistory && !isNatalChartInterpretation)
      ? `${question}` // Just the question for follow-ups - context is in conversation history
      : isSpecificReference 
        ? `${question}

Here's my chart data for reference:
${formattedChart}

Please focus specifically on what I'm asking about. I don't need a full chart overview - just elaborate on the specific point I mentioned.`
        : `${question}

Here's my chart data:
${formattedChart}

I'd love to hear your thoughts and insights! Feel free to ask me follow-up questions or explore whatever seems most interesting or relevant from my chart.`
  };
  
  // Build message history including conversation context
  const messages = [systemMsg];
  
  // Add previous conversation history if available (excluding timestamps)
  // Ensure proper alternating user/assistant pattern
  if (conversationHistory && conversationHistory.length > 0) {
    // Filter and validate conversation history
    const validHistory = conversationHistory.filter(msg => 
      msg.role && msg.content && (msg.role === 'user' || msg.role === 'assistant')
    );
    
    // Ensure alternating pattern - remove any consecutive messages from same role
    const alternatingHistory = [];
    let lastRole = null;
    
    for (const msg of validHistory) {
      if (msg.role !== lastRole) {
        alternatingHistory.push({
          role: msg.role,
          content: msg.content
        });
        lastRole = msg.role;
      }
    }
    
    // Only add if we have valid alternating history
    if (alternatingHistory.length > 0) {
      messages.push(...alternatingHistory);
    }
  }
  
  // Add current user message
  messages.push(userMsg);
  
  console.log(`💬 Sending ${messages.length} messages to LLM (including ${conversationHistory?.length || 0} history items)`);
  console.log('🔍 Message structure:');
  messages.forEach((msg, i) => {
    console.log(`  ${i}: ${msg.role} - ${msg.content.substring(0, 100)}...`);
  });
  
  // Calculate approximate token count to prevent overload
  const totalContent = messages.map(m => m.content).join(' ');
  const approxTokens = totalContent.length / 4; // Rough estimate: 4 chars per token
  console.log(`📊 Approximate tokens: ${approxTokens}`);
  
  // Token limiting to avoid 400 errors - higher limit for fresh interpretations
  if (approxTokens > 15000) { // Allow more tokens for complete chart interpretations
    console.log('⚠️ Context too large, trimming conversation history and chart data');
    // Keep only system message and a minimal version of current question
    const minimalUserMsg = {
      role: 'user',
      content: `${question}\n\nMinimal chart data:\nASCENDANT: ${chartData.ascendant ? degreeToSign(chartData.ascendant) : 'Unknown'}\nPLANETS: ${chartData.planets?.slice(0, 10).map(p => `${p.name} in ${degreeToSign(p.longitude)}`).join(', ')}`
    };
    messages.splice(0, messages.length, messages[0], minimalUserMsg);
  }
  
  try {
    const response = await axios.post(SONAR_ENDPOINT, {
      model: 'llama-3.1-sonar-large-128k-online',
      messages
    }, {
      headers: {
        'Authorization': `Bearer ${SONAR_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data?.choices?.[0]?.message?.content || 'No interpretation returned.';
  } catch (error) {
    console.error('API Error:', error.message);
    throw new Error(`API failed: ${error.message}`);
  }
}

module.exports = { interpretChart, interpretTransits, interpretChartQuery, findAllAspects };