const axios = require('axios');

console.log('🎯 [utils/interpreter] module loaded');

const SONAR_ENDPOINT = process.env.SONAR_ENDPOINT || 'https://api.perplexity.ai/chat/completions';
const SONAR_API_KEY = process.env.SONAR_API_KEY;

const ARABIC_SIGNS = ['الحمل','الثور','الجوزاء','السرطان','الأسد','العذراء','الميزان','العقرب','القوس','الجدي','الدلو','الحوت'];
const ENGLISH_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const FRENCH_SIGNS = ['Bélier', 'Taureau', 'Gémeaux', 'Cancer', 'Lion', 'Vierge', 'Balance', 'Scorpion', 'Sagittaire', 'Capricorne', 'Verseau', 'Poissons'];

// Helper functions
function signDetails(lon) {
  const norm = ((lon % 360) + 360) % 360;
  const idx = Math.floor(norm / 30);
  const degree = Math.floor(norm % 30);
  const minutes = Math.floor(((norm % 30) - degree) * 60);
  
  return {
    idx,
    signAr: ARABIC_SIGNS[idx] || 'unknown',
    signEn: ENGLISH_SIGNS[idx] || 'unknown', 
    signFr: FRENCH_SIGNS[idx] || 'unknown',
    degree,
    minutes
  };
}

function findHouse(longitude, houses) {
  if (!Array.isArray(houses) || houses.length === 0) return null;
  
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

function formatPlanetPosition(planet, language = 'English') {
  const details = signDetails(planet.longitude);
  const signs = language === 'Arabic' ? ARABIC_SIGNS : 
                language === 'French' ? FRENCH_SIGNS : ENGLISH_SIGNS;
  
  const signName = signs[details.idx];
  const retrograde = planet.retrograde ? 
    (language === 'Arabic' ? ' (رجعي)' : 
     language === 'French' ? ' (R)' : ' (R)') : '';
  
  return {
    name: planet.name,
    sign: signName,
    degree: details.degree,
    minutes: details.minutes,
    exactDegree: planet.longitude.toFixed(2),
    retrograde: planet.retrograde || false,
    house: planet.house || null,
    formatted: `${planet.name} in ${signName} ${details.degree}°${details.minutes}'${retrograde}`
  };
}

function computePlanetPositions(planets, houses = []) {
  return planets.map(p => {
    const position = formatPlanetPosition(p);
    return {
      ...position,
      house: findHouse(p.longitude, houses)
    };
  });
}

function findMajorAspects(planets) {
  const aspects = [];
  const aspectAngles = [
    { name: 'Conjunction', angle: 0, orb: 8 },
    { name: 'Sextile', angle: 60, orb: 6 },
    { name: 'Square', angle: 90, orb: 8 },
    { name: 'Trine', angle: 120, orb: 8 },
    { name: 'Opposition', angle: 180, orb: 8 }
  ];

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      let diff = Math.abs(planets[i].longitude - planets[j].longitude);
      if (diff > 180) diff = 360 - diff;

      for (const aspect of aspectAngles) {
        if (Math.abs(diff - aspect.angle) <= aspect.orb) {
          aspects.push({
            planet1: planets[i].name,
            planet2: planets[j].name,
            aspect: aspect.name,
            orb: Math.abs(diff - aspect.angle).toFixed(1),
            exactness: Math.abs(diff - aspect.angle) < 2 ? 'exact' : 'wide'
          });
          break;
        }
      }
    }
  }
  return aspects;
}

// Enhanced chart formatting for LLM
function formatChartForLLM(chartData, language = 'English') {
  const formatted = {
    birthInfo: {
      date: chartData.birthDate || 'Unknown',
      time: chartData.birthTime || 'Unknown', 
      place: chartData.birthPlace || 'Unknown'
    },
    chartElements: {}
  };

  // Ascendant
  if (typeof chartData.ascendant === 'number') {
    const ascDetails = signDetails(chartData.ascendant);
    const signs = language === 'Arabic' ? ARABIC_SIGNS : 
                  language === 'French' ? FRENCH_SIGNS : ENGLISH_SIGNS;
    formatted.chartElements.ascendant = {
      sign: signs[ascDetails.idx],
      degree: ascDetails.degree,
      minutes: ascDetails.minutes,
      exactDegree: chartData.ascendant.toFixed(2)
    };
  }

  // Planets with houses and aspects
  if (Array.isArray(chartData.planets)) {
    const planetsWithPositions = computePlanetPositions(chartData.planets, chartData.houses);
    formatted.chartElements.planets = planetsWithPositions;
    formatted.chartElements.aspects = findMajorAspects(chartData.planets);
  }

  // Houses (if available)
  if (Array.isArray(chartData.houses)) {
    formatted.chartElements.houses = chartData.houses.map((cusp, index) => {
      const details = signDetails(cusp);
      const signs = language === 'Arabic' ? ARABIC_SIGNS : 
                    language === 'French' ? FRENCH_SIGNS : ENGLISH_SIGNS;
      return {
        house: index + 1,
        sign: signs[details.idx],
        degree: details.degree,
        minutes: details.minutes
      };
    });
  }

  // Current transits (if provided)
  if (Array.isArray(chartData.transits)) {
    formatted.currentTransits = chartData.transits.map(transit => {
      const details = signDetails(transit.currentLongitude);
      const signs = language === 'Arabic' ? ARABIC_SIGNS : 
                    language === 'French' ? FRENCH_SIGNS : ENGLISH_SIGNS;
      return {
        planet: transit.name,
        currentSign: signs[details.idx],
        currentDegree: details.degree,
        currentMinutes: details.minutes,
        retrograde: transit.retrograde || false,
        aspects: transit.aspects || []
      };
    });
  }

  return formatted;
}

// Build comprehensive astrological prompt
function buildAstrologicalPrompt(chartData, question, language = 'English') {
  const formattedChart = formatChartForLLM(chartData, language);
  
  let prompt = `NATAL CHART ANALYSIS REQUEST\n\n`;
  
  // Birth Information
  prompt += `Birth Information:\n`;
  prompt += `• Date: ${formattedChart.birthInfo.date}\n`;
  prompt += `• Time: ${formattedChart.birthInfo.time}\n`;
  prompt += `• Place: ${formattedChart.birthInfo.place}\n\n`;
  
  // Ascendant
  if (formattedChart.chartElements.ascendant) {
    const asc = formattedChart.chartElements.ascendant;
    prompt += `Ascendant: ${asc.sign} ${asc.degree}°${asc.minutes}'\n\n`;
  }
  
  // Planets
  if (formattedChart.chartElements.planets) {
    prompt += `PLANETARY POSITIONS:\n`;
    formattedChart.chartElements.planets.forEach(planet => {
      const houseText = planet.house ? ` (House ${planet.house})` : '';
      const retroText = planet.retrograde ? ' Retrograde' : '';
      prompt += `• ${planet.name}: ${planet.sign} ${planet.degree}°${planet.minutes}'${retroText}${houseText}\n`;
    });
    prompt += '\n';
  }
  
  // Major Aspects
  if (formattedChart.chartElements.aspects && formattedChart.chartElements.aspects.length > 0) {
    prompt += `MAJOR ASPECTS:\n`;
    formattedChart.chartElements.aspects.forEach(aspect => {
      prompt += `• ${aspect.planet1} ${aspect.aspect} ${aspect.planet2} (orb: ${aspect.orb}°)\n`;
    });
    prompt += '\n';
  }
  
  // Current Transits (if available)
  if (formattedChart.currentTransits && formattedChart.currentTransits.length > 0) {
    prompt += `CURRENT TRANSITS:\n`;
    formattedChart.currentTransits.forEach(transit => {
      const retroText = transit.retrograde ? ' Retrograde' : '';
      prompt += `• ${transit.planet}: ${transit.currentSign} ${transit.currentDegree}°${transit.currentMinutes}'${retroText}\n`;
    });
    prompt += '\n';
  }
  
  // The Question
  prompt += `SPECIFIC QUESTION: ${question}\n\n`;
  prompt += `Please provide a detailed astrological interpretation that directly addresses this question using the specific planetary positions, signs, houses, and aspects listed above. Reference exact degrees and placements in your response.`;
  
  return prompt;
}

// System prompts for different query types
function getSystemPrompt(language = 'English', queryType = 'general') {
  const prompts = {
    English: {
      general: `You are a professional astrologer with 20+ years of experience providing accurate, insightful natal chart interpretations. 

CRITICAL INSTRUCTIONS:
1. Base your interpretation ONLY on the specific chart data provided
2. Reference exact planetary positions, degrees, signs, and houses from the data
3. Never give generic astrological statements - be specific to this individual's chart
4. Always mention specific degrees when discussing planetary placements
5. Explain how different chart elements interact with each other
6. Connect your insights to the person's specific question

Your interpretation should be warm, professional, and deeply personalized to the chart provided.`,

      transit: `You are a professional astrologer specializing in transit analysis and predictive astrology.

CRITICAL INSTRUCTIONS:
1. Use BOTH the natal chart and current transit data provided
2. Focus on how current transits specifically affect this person's natal planets
3. Be specific about timing when transit data is available
4. Reference exact degrees and orbs in your analysis
5. Explain the astrological reasoning behind your predictions
6. Consider the person's natal chart as the foundation for how transits manifest

Provide practical, actionable insights based on the specific astrological data given.`,

      compatibility: `You are a professional astrologer specializing in relationship compatibility and synastry analysis.

Focus on how the chart elements indicate relationship patterns, compatibility factors, and potential challenges or strengths in partnerships.`
    },
    
    Arabic: {
      general: `أنت منجم محترف لديك خبرة أكثر من 20 سنة في تقديم تفسيرات دقيقة ومفيدة للخرائط الفلكية.

تعليمات حاسمة:
1. أسس تفسيرك فقط على بيانات الخريطة المحددة المقدمة
2. اذكر مواقع الكواكب الدقيقة والدرجات والأبراج والبيوت من البيانات
3. لا تعطِ تصريحات فلكية عامة - كن محدداً لخريطة هذا الشخص
4. اذكر دائماً الدرجات المحددة عند مناقشة مواضع الكواكب
5. اشرح كيف تتفاعل عناصر الخريطة المختلفة مع بعضها البعض
6. اربط رؤاك بسؤال الشخص المحدد

يجب أن يكون تفسيرك دافئاً ومهنياً ومخصصاً بعمق للخريطة المقدمة.`,

      transit: `أنت منجم محترف متخصص في تحليل التحويلات وعلم التنجيم التنبؤي.

تعليمات حاسمة:
1. استخدم كلاً من الخريطة الفلكية وبيانات التحويلات الحالية المقدمة
2. ركز على كيفية تأثير التحويلات الحالية تحديداً على كواكب هذا الشخص الفلكية
3. كن محدداً حول التوقيت عند توفر بيانات التحويل
4. اذكر الدرجات والمدارات الدقيقة في تحليلك
5. اشرح المنطق الفلكي وراء تنبؤاتك
6. اعتبر الخريطة الفلكية للشخص كأساس لكيفية ظهور التحويلات

قدم رؤى عملية وقابلة للتطبيق بناءً على البيانات الفلكية المحددة المعطاة.`
    },
    
    French: {
      general: `Vous êtes un astrologue professionnel avec plus de 20 ans d'expérience dans l'interprétation précise et perspicace des cartes natales.

INSTRUCTIONS CRITIQUES:
1. Basez votre interprétation UNIQUEMENT sur les données de carte spécifiques fournies
2. Référencez les positions planétaires exactes, degrés, signes et maisons des données
3. Ne donnez jamais de déclarations astrologiques génériques - soyez spécifique à la carte de cette personne
4. Mentionnez toujours les degrés spécifiques lors de la discussion des placements planétaires
5. Expliquez comment les différents éléments de la carte interagissent entre eux
6. Connectez vos insights à la question spécifique de la personne

Votre interprétation devrait être chaleureuse, professionnelle et profondément personnalisée à la carte fournie.`,

      transit: `Vous êtes un astrologue professionnel spécialisé dans l'analyse des transits et l'astrologie prédictive.

INSTRUCTIONS CRITIQUES:
1. Utilisez À LA FOIS la carte natale et les données de transits actuels fournies
2. Concentrez-vous sur comment les transits actuels affectent spécifiquement les planètes natales de cette personne
3. Soyez spécifique sur le timing quand les données de transit sont disponibles
4. Référencez les degrés exacts et les orbes dans votre analyse
5. Expliquez le raisonnement astrologique derrière vos prédictions
6. Considérez la carte natale de la personne comme base pour comment les transits se manifestent

Fournissez des insights pratiques et exploitables basés sur les données astrologiques spécifiques données.`
    }
  };
  
  return prompts[language]?.[queryType] || prompts.English.general;
}

// Determine query type
function classifyQuery(question) {
  const lower = question.toLowerCase();
  
  if (lower.includes('will') || lower.includes('when') || lower.includes('next') || 
      lower.includes('future') || lower.includes('transit') || lower.includes('tomorrow') ||
      lower.includes('today') || lower.includes('week') || lower.includes('month')) {
    return 'transit';
  }
  
  if (lower.includes('compatibility') || lower.includes('relationship') || 
      lower.includes('partner') || lower.includes('love') || lower.includes('marriage')) {
    return 'compatibility';
  }
  
  return 'general';
}

/**
 * Enhanced chart interpretation using structured data and professional prompts
 */
async function interpretChartQuery(chartData, question, dialect = 'English') {
  if (!SONAR_API_KEY) {
    throw new Error('SONAR_API_KEY is not set; please set the env var before interpreting.');
  }

  const queryType = classifyQuery(question);
  const systemPrompt = getSystemPrompt(dialect, queryType);
  const userPrompt = buildAstrologicalPrompt(chartData, question, dialect);

  console.log('🎯 [interpreter] Structured prompt created:', userPrompt.slice(0, 500) + '...');

  try {
    console.log('🕒 [interpreter] Sending structured prompt to Sonar at', new Date().toISOString());
    const t0 = Date.now();

    const response = await axios.post(SONAR_ENDPOINT, {
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3, // Lower temperature for more focused responses
      max_tokens: 2000
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

// Original functions (keeping for backward compatibility)
const interpretChart = async ({ chartData, dialect = 'Modern Standard Arabic' }) => {
  // Convert to new format and call enhanced function
  const question = 'Please provide a comprehensive spiritual interpretation of my natal chart.';
  return await interpretChartQuery(chartData, question, dialect);
};

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

module.exports = { interpretChart, interpretTransits, interpretChartQuery };