const swisseph = require('swisseph');

// Helper: get current Julian Day in UT
function getTodayJulianDay() {
  const now = new Date();
  return swisseph.swe_julday(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600,
    swisseph.SE_GREG_CAL
  );
}

// Helper: find which house a longitude falls in
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

// Helper: convert degree to sign
function degreeToSign(deg) {
  const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  return signs[Math.floor((deg % 360) / 30)];
}

/**
 * Compute live transits for a natal chart with house analysis.
 * @param {Object} chartData - must include planets array and houses array
 * @returns {Array} transit objects with detailed information
 */
function getLiveTransits(chartData) {
  if (!chartData || !Array.isArray(chartData.planets)) {
    throw new Error('Missing natal chart data (chartData.planets)');
  }

  console.log('🔮 Getting live transits for chart with', chartData.planets.length, 'planets');

  const jdNow = getTodayJulianDay();
  console.log('📅 Current Julian Day:', jdNow);
  
  const flag = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;

  // Major aspect configurations with orbs
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

  // Calculate current positions for all planets
  const transitData = [];
  
  // Define planet IDs directly to avoid constant issues
  const transitPlanets = [
    { name: 'SUN', id: 0 },        // SE_SUN
    { name: 'MOON', id: 1 },       // SE_MOON
    { name: 'MERCURY', id: 2 },    // SE_MERCURY
    { name: 'VENUS', id: 3 },      // SE_VENUS
    { name: 'MARS', id: 4 },       // SE_MARS
    { name: 'JUPITER', id: 5 },    // SE_JUPITER
    { name: 'SATURN', id: 6 },     // SE_SATURN
    { name: 'URANUS', id: 7 },     // SE_URANUS
    { name: 'NEPTUNE', id: 8 },    // SE_NEPTUNE
    { name: 'PLUTO', id: 9 }       // SE_PLUTO
  ];

  for (const planet of transitPlanets) {
    try {
      console.log(`📊 Calculating transit for ${planet.name} (ID: ${planet.id})`);
      
      const result = swisseph.swe_calc_ut(jdNow, planet.id, flag);
      
      if (!result || typeof result.longitude === 'undefined') {
        console.warn(`⚠️ No result for ${planet.name}`);
        continue;
      }
      
      const longitude = result.longitude;
      const longitudeSpeed = result.longitudeSpeed || result.speed || 0;
      const retrograde = longitudeSpeed < 0;
      
      // Find which house the transiting planet is currently in
      const currentHouse = findHouse(longitude, chartData.houses);
      const currentSign = degreeToSign(longitude);
      
      // Find aspects to natal positions
      const aspects = [];
      
      chartData.planets.forEach(natalPlanet => {
        if (!natalPlanet.longitude && natalPlanet.longitude !== 0) {
          console.warn(`⚠️ Natal planet ${natalPlanet.name} has no longitude`);
          return;
        }
        
        let diff = Math.abs((longitude - natalPlanet.longitude + 360) % 360);
        if (diff > 180) diff = 360 - diff;
        
        for (const aspectType of aspectTypes) {
          if (Math.abs(diff - aspectType.angle) <= aspectType.orb) {
            const orb = Math.abs(diff - aspectType.angle);
            
            // Find which house the natal planet is in
            const natalHouse = natalPlanet.house || findHouse(natalPlanet.longitude, chartData.houses);
            
            aspects.push({
              type: aspectType.name,
              with: natalPlanet.name,
              natalHouse: natalHouse,
              natalSign: natalPlanet.sign || degreeToSign(natalPlanet.longitude),
              orb: orb.toFixed(2),
              applying: isApplying(longitude, natalPlanet.longitude, longitudeSpeed, aspectType.angle)
            });
            break;
          }
        }
      });
      
      // Also check transits through houses (when a planet enters a new house)
      const houseRuler = getHouseRuler(currentHouse, chartData);
      
      transitData.push({
        name: planet.name,
        currentLongitude: longitude,
        currentSign: currentSign,
        currentHouse: currentHouse,
        speed: longitudeSpeed,
        retrograde: retrograde,
        aspects: aspects,
        houseRuler: houseRuler,
        degree: Math.floor(longitude % 30),
        minutes: Math.floor(((longitude % 30) % 1) * 60)
      });
      
      console.log(`✅ ${planet.name} transit calculated: ${currentSign} ${Math.floor(longitude % 30)}°`);
      
    } catch (err) {
      console.error(`❌ Failed to calculate transit for ${planet.name}:`, err.message);
      // Continue with other planets instead of failing completely
    }
  }

  console.log(`🎯 Total transits calculated: ${transitData.length}`);
  return transitData;
}

// Helper: determine if aspect is applying or separating
function isApplying(transitLon, natalLon, transitSpeed, aspectAngle) {
  const currentDiff = Math.abs((transitLon - natalLon + 360) % 360);
  const targetDiff = aspectAngle;
  
  // If moving forward and current diff < target, it's applying
  if (transitSpeed > 0) {
    return currentDiff < targetDiff;
  }
  // If retrograde, logic is reversed
  return currentDiff > targetDiff;
}

// Helper: get the ruler of a house based on the sign on its cusp
function getHouseRuler(houseNum, chartData) {
  if (!houseNum || !chartData.houses || !chartData.houses[houseNum - 1]) return null;
  
  const houseCusp = chartData.houses[houseNum - 1];
  const sign = degreeToSign(houseCusp);
  
  const rulers = {
    'Aries': 'MARS',
    'Taurus': 'VENUS',
    'Gemini': 'MERCURY',
    'Cancer': 'MOON',
    'Leo': 'SUN',
    'Virgo': 'MERCURY',
    'Libra': 'VENUS',
    'Scorpio': 'MARS/PLUTO',
    'Sagittarius': 'JUPITER',
    'Capricorn': 'SATURN',
    'Aquarius': 'SATURN/URANUS',
    'Pisces': 'JUPITER/NEPTUNE'
  };
  
  return rulers[sign] || null;
}

/**
 * Filter transits relevant to a specific question
 * @param {Array} allTransits - all calculated transits
 * @param {string} question - user's question
 * @param {Object} chartData - natal chart data
 * @returns {Array} filtered transits most relevant to the question
 */
function filterRelevantTransits(allTransits, question, chartData) {
  const questionLower = question.toLowerCase();
  
  // Keywords mapping to houses and planets
  const houseKeywords = {
    1: ['self', 'identity', 'appearance', 'body', 'moi', 'identité', 'apparence', 'الذات', 'الهوية'],
    2: ['money', 'income', 'possessions', 'values', 'argent', 'revenus', 'المال', 'الدخل'],
    3: ['communication', 'siblings', 'short trips', 'travel', 'voyage', 'frères', 'الاتصال', 'السفر'],
    4: ['home', 'family', 'roots', 'country', 'pays', 'maison', 'famille', 'البيت', 'العائلة', 'البلد'],
    5: ['love', 'romance', 'children', 'creativity', 'amour', 'enfants', 'الحب', 'الأطفال'],
    6: ['work', 'health', 'daily', 'routine', 'travail', 'santé', 'العمل', 'الصحة'],
    7: ['partner', 'marriage', 'relationships', 'partenaire', 'mariage', 'الشريك', 'الزواج'],
    8: ['transformation', 'death', 'shared resources', 'transformation', 'mort', 'التحول', 'الموت'],
    9: ['travel', 'philosophy', 'higher education', 'foreign', 'voyage', 'étranger', 'pays', 'السفر', 'الخارج'],
    10: ['career', 'reputation', 'public', 'carrière', 'réputation', 'المهنة', 'السمعة'],
    11: ['friends', 'groups', 'hopes', 'amis', 'groupes', 'الأصدقاء', 'المجموعات'],
    12: ['spirituality', 'hidden', 'isolation', 'spiritualité', 'caché', 'الروحانية', 'المخفي']
  };
  
  const planetKeywords = {
    'JUPITER': ['expansion', 'growth', 'luck', 'travel', 'foreign', 'chance', 'voyage', 'étranger', 'النمو', 'السفر', 'الحظ'],
    'SATURN': ['restriction', 'delay', 'responsibility', 'time', 'restriction', 'temps', 'القيود', 'الوقت'],
    'URANUS': ['change', 'sudden', 'unexpected', 'changement', 'soudain', 'التغيير', 'المفاجئ'],
    'NEPTUNE': ['confusion', 'dreams', 'illusion', 'rêves', 'الأحلام', 'الوهم'],
    'PLUTO': ['transformation', 'power', 'deep change', 'pouvoir', 'التحول', 'القوة'],
    'MARS': ['action', 'energy', 'conflict', 'énergie', 'الطاقة', 'الصراع'],
    'VENUS': ['love', 'money', 'relationships', 'amour', 'argent', 'الحب', 'المال'],
    'MERCURY': ['communication', 'travel', 'documents', 'voyage', 'الاتصال', 'السفر'],
    'SUN': ['self', 'vitality', 'identity', 'vitalité', 'الذات', 'الحيوية'],
    'MOON': ['emotions', 'home', 'family', 'émotions', 'maison', 'العواطف', 'البيت']
  };
  
  // For general time period questions (rest of June, this month, etc.)
  if (questionLower.includes('june') || questionLower.includes('month') || 
      questionLower.includes('rest of') || questionLower.includes('looking for') ||
      questionLower.includes('juin') || questionLower.includes('mois')) {
    // Return all transits with aspects, prioritizing major aspects
    return allTransits
      .filter(t => t.aspects.length > 0)
      .sort((a, b) => {
        // Prioritize slower-moving planets for period overviews
        const planetOrder = ['PLUTO', 'NEPTUNE', 'URANUS', 'SATURN', 'JUPITER', 'MARS', 'SUN', 'VENUS', 'MERCURY', 'MOON'];
        const aIndex = planetOrder.indexOf(a.name);
        const bIndex = planetOrder.indexOf(b.name);
        return aIndex - bIndex;
      })
      .slice(0, 7); // Top 7 transits for period overview
  }
  
  // Score each transit based on relevance
  const scoredTransits = allTransits.map(transit => {
    let score = 0;
    
    // Check if planet keywords match question
    const planetKeys = planetKeywords[transit.name] || [];
    planetKeys.forEach(keyword => {
      if (questionLower.includes(keyword)) score += 3;
    });
    
    // Check if current house matches question keywords
    for (const [house, keywords] of Object.entries(houseKeywords)) {
      if (parseInt(house) === transit.currentHouse) {
        keywords.forEach(keyword => {
          if (questionLower.includes(keyword)) score += 2;
        });
      }
    }
    
    // Check aspects to relevant houses
    transit.aspects.forEach(aspect => {
      for (const [house, keywords] of Object.entries(houseKeywords)) {
        if (parseInt(house) === aspect.natalHouse) {
          keywords.forEach(keyword => {
            if (questionLower.includes(keyword)) score += 2;
          });
        }
      }
      
      // Prioritize applying aspects
      if (aspect.applying) score += 1;
      
      // Prioritize major aspects
      if (['Conjunction', 'Square', 'Opposition', 'Trine'].includes(aspect.type)) {
        score += 1;
      }
    });
    
    return { ...transit, relevanceScore: score };
  });
  
  // Sort by relevance and return top transits
  const relevant = scoredTransits
    .filter(t => t.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5); // Top 5 most relevant
  
  // If no relevant transits found, return transits to important houses
  if (relevant.length === 0) {
    // For travel questions, focus on 3rd, 4th, 9th houses
    if (questionLower.includes('travel') || questionLower.includes('voyage') || 
        questionLower.includes('pays') || questionLower.includes('السفر')) {
      return allTransits.filter(t => 
        [3, 4, 9].includes(t.currentHouse) || 
        t.aspects.some(a => [3, 4, 9].includes(a.natalHouse))
      );
    }
    
    // Return transits with any aspects
    return allTransits.filter(t => t.aspects.length > 0).slice(0, 3);
  }
  
  return relevant;
}

module.exports = { getLiveTransits, filterRelevantTransits };