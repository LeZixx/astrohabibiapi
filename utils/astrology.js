const swisseph = require('swisseph');
const path = require('path');
swisseph.swe_set_ephe_path(path.join(__dirname, '../node_modules/swisseph/ephe'));
const { DateTime } = require('luxon');
const axios = require('axios');
const tzlookup = require('tz-lookup');

// Major asteroids with tight orbs for natal and transit charts
function calculateAsteroids(julianDay) {
  const majorAsteroids = [
    { name: 'CERES', id: swisseph.SE_CERES },      // Swiss Ephemeris constant = 17
    { name: 'PALLAS', id: swisseph.SE_PALLAS },    // Swiss Ephemeris constant = 18
    { name: 'JUNO', id: swisseph.SE_JUNO },        // Swiss Ephemeris constant = 19
    { name: 'VESTA', id: swisseph.SE_VESTA },      // Swiss Ephemeris constant = 20
    { name: 'CHIRON', id: swisseph.SE_CHIRON },    // Swiss Ephemeris constant = 15
    { name: 'PSYCHE', id: 16 },                    // Direct ID - works with proper ephe path
    { name: 'HYGEIA', id: 10 }                     // Direct ID - works with proper ephe path
    // Note: EROS (433) requires separate ephemeris file se00433s.se1 not included in basic distribution
  ];

  const asteroidPositions = [];
  
  for (const asteroid of majorAsteroids) {
    try {
      const result = swisseph.swe_calc_ut(julianDay, asteroid.id, swisseph.SEFLG_SPEED);
      console.log(`🪨 ${asteroid.name} (${asteroid.id}): ${result.longitude}°`);
      
      // Validate the result before using it
      if (result && typeof result.longitude === 'number' && !isNaN(result.longitude) && 
          typeof result.longitudeSpeed === 'number' && !isNaN(result.longitudeSpeed)) {
        asteroidPositions.push({
          name: asteroid.name,
          longitude: result.longitude,
          retrograde: result.longitudeSpeed < 0,
          type: 'asteroid',
          orb: 2.5 // Tight orb for asteroids
        });
      } else {
        console.warn(`⚠️ Invalid calculation result for ${asteroid.name} (${asteroid.id}):`, {
          longitude: result?.longitude,
          longitudeSpeed: result?.longitudeSpeed,
          fullResult: result
        });
      }
    } catch (e) {
      console.warn(`⚠️ Failed to calculate ${asteroid.name}:`, e.message);
    }
  }
  
  return asteroidPositions;
}

// Major fixed stars with very tight orbs
function calculateFixedStars(julianDay) {
  // Major fixed stars with their names and coordinates (epoch 2000.0)
  const majorFixedStars = [
    { name: 'REGULUS', ra: 152.092, dec: 11.967 },        // Heart of the Lion
    { name: 'SPICA', ra: 201.298, dec: -11.161 },         // The Wheat Sheaf  
    { name: 'ARCTURUS', ra: 213.915, dec: 19.182 },       // The Bear Guard
    { name: 'ANTARES', ra: 247.352, dec: -26.432 },       // Heart of the Scorpion
    { name: 'VEGA', ra: 279.234, dec: 38.784 },           // The Harp Star
    { name: 'SIRIUS', ra: 101.287, dec: -16.716 },        // The Dog Star
    { name: 'ALDEBARAN', ra: 69.179, dec: 16.509 },       // The Follower
    { name: 'BETELGEUSE', ra: 88.793, dec: 7.407 },       // Giant's Shoulder
    { name: 'RIGEL', ra: 78.634, dec: -8.202 },           // The Left Foot
    { name: 'ALGOL', ra: 47.042, dec: 40.956 }            // The Demon Star
  ];

  const fixedStarPositions = [];
  
  for (const star of majorFixedStars) {
    try {
      // Convert RA/Dec to ecliptic longitude for the given Julian Day
      const coords = swisseph.swe_cotrans(star.ra, star.dec, 1.0, -swisseph.SE_ECL2EQU);
      const longitude = coords.longitude;
      
      // Apply precession to get position for the chart date
      const precessedCoords = swisseph.swe_fixstar2_ut(star.name, julianDay, swisseph.SEFLG_SWIEPH);
      
      console.log(`⭐ ${star.name}: ${precessedCoords ? precessedCoords.longitude : longitude}°`);
      
      fixedStarPositions.push({
        name: star.name,
        longitude: precessedCoords ? precessedCoords.longitude : longitude,
        retrograde: false, // Fixed stars don't retrograde
        type: 'fixed_star',
        orb: 1.0 // Very tight orb for fixed stars
      });
    } catch (e) {
      console.warn(`⚠️ Failed to calculate ${star.name}:`, e.message);
    }
  }
  
  return fixedStarPositions;
}

async function calcJulianDayAndCoords(birthDate, birthTime, birthPlace) {
  if (!birthTime) {
    birthTime = '12:00 PM';
  }
  const geoRes = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: birthPlace, format: 'json', limit: 1 }
  });
  if (!geoRes.data.length) throw new Error('Location not found');
  const lat = parseFloat(geoRes.data[0].lat);
  const lon = parseFloat(geoRes.data[0].lon);
  const zone = tzlookup(lat, lon);

  // 1. Parse in local zone
  const dt = DateTime.fromFormat(
    `${birthDate} ${birthTime}`,
    'd LLLL yyyy h:mm a',
    { zone, setZone: true }
  );
  if (!dt.isValid) {
    throw new Error(`Invalid date/time: ${birthDate} ${birthTime}`);
  }
  // 2. Convert to UTC
  const utc = dt.toUTC();
  // 3. Compute Julian Day in UT
  let jd = swisseph.swe_julday(
    utc.year, utc.month, utc.day,
    utc.hour + utc.minute / 60 + utc.second / 3600,
    swisseph.SE_GREG_CAL
  );
  // 4. Convert UT to TT by adding ΔT
  const { delta: deltaT } = swisseph.swe_deltat(jd);
  const julianDayTT = jd + deltaT / 86400;

  // force numeric types for safety
  const jdNum  = Number(julianDayTT);
  const latNum = Number(lat);
  const lonNum = Number(lon);

  console.log('🔍 calcJulianDayAndCoords →', { jd: jdNum, lat: latNum, lon: lonNum });

  return { julianDay: jdNum, lat: latNum, lon: lonNum };
}

async function calculateFullChart({ julianDay, lat, lon, hasBirthTime }) {
  console.log('🔍 calculateFullChart input →', { julianDay, lat, lon });

  // Define planet constants - standard planets first
  const standardPlanets = [
    { name: 'Sun',      id: swisseph.SE_SUN },
    { name: 'Moon',     id: swisseph.SE_MOON },
    { name: 'Mercury',  id: swisseph.SE_MERCURY },
    { name: 'Venus',    id: swisseph.SE_VENUS },
    { name: 'Mars',     id: swisseph.SE_MARS },
    { name: 'Jupiter',  id: swisseph.SE_JUPITER },
    { name: 'Saturn',   id: swisseph.SE_SATURN },
    { name: 'Uranus',   id: swisseph.SE_URANUS },
    { name: 'Neptune',  id: swisseph.SE_NEPTUNE },
    { name: 'Pluto',    id: swisseph.SE_PLUTO },
  ];

  // Get North Node - test both True and Mean Node
  let northNode = null;
  console.log('🔍 Testing North Node calculation methods:');
  
  // Try SE_TRUE_NODE first (more accurate for specific dates)
  if (typeof swisseph.SE_TRUE_NODE !== 'undefined') {
    try {
      const result = swisseph.swe_calc_ut(julianDay, swisseph.SE_TRUE_NODE, swisseph.SEFLG_SWIEPH);
      console.log(`📍 SE_TRUE_NODE: ${result.longitude}°`);
      northNode = { name: 'NORTH NODE', longitude: result.longitude, method: 'TRUE_NODE' };
    } catch (e) {
      console.warn('⚠️ SE_TRUE_NODE failed:', e.message);
    }
  }
  
  // Try SE_MEAN_NODE as fallback
  if (!northNode && typeof swisseph.SE_MEAN_NODE !== 'undefined') {
    try {
      const result = swisseph.swe_calc_ut(julianDay, swisseph.SE_MEAN_NODE, swisseph.SEFLG_SWIEPH);
      console.log(`📍 SE_MEAN_NODE: ${result.longitude}°`);
      northNode = { name: 'NORTH NODE', longitude: result.longitude, method: 'MEAN_NODE' };
    } catch (e) {
      console.warn('⚠️ SE_MEAN_NODE failed:', e.message);
    }
  }
  
  // Try using numeric constants directly
  const nodeConstants = [
    { name: 'SE_TRUE_NODE', value: 11 },
    { name: 'SE_MEAN_NODE', value: 10 }
  ];
  
  for (const constant of nodeConstants) {
    if (!northNode && !swisseph[constant.name]) {
      try {
        const result = swisseph.swe_calc_ut(julianDay, constant.value, swisseph.SEFLG_SWIEPH);
        console.log(`📍 ${constant.name} (${constant.value}): ${result.longitude}°`);
        northNode = { name: 'NORTH NODE', longitude: result.longitude, method: constant.name };
        break;
      } catch (e) {
        console.warn(`⚠️ ${constant.name} (${constant.value}) failed:`, e.message);
      }
    }
  }

  // Get Lilith (Black Moon) - prefer mean apogee
  let lilith = null;
  console.log('🔍 Testing Lilith calculation methods:');

  // Try SE_MEAN_APOG first (mean apogee gives published reference)
  if (typeof swisseph.SE_MEAN_APOG !== 'undefined') {
    try {
      const result = swisseph.swe_calc_ut(julianDay, swisseph.SE_MEAN_APOG, swisseph.SEFLG_SWIEPH);
      console.log(`📍 SE_MEAN_APOG: ${result.longitude}°`);
      lilith = { name: 'LILITH', longitude: result.longitude, method: 'MEAN_APOG' };
    } catch (e) {
      console.warn('⚠️ SE_MEAN_APOG failed:', e.message);
    }
  }

  // If mean apogee didn't yield a value, fall back to SE_INTP_APOG
  if (!lilith && typeof swisseph.SE_INTP_APOG !== 'undefined') {
    try {
      const result = swisseph.swe_calc_ut(julianDay, swisseph.SE_INTP_APOG, swisseph.SEFLG_SWIEPH);
      console.log(`📍 SE_INTP_APOG: ${result.longitude}°`);
      lilith = { name: 'LILITH', longitude: result.longitude, method: 'INTP_APOG' };
    } catch (e) {
      console.warn('⚠️ SE_INTP_APOG failed:', e.message);
    }
  }

  // If still no Lilith, try SE_OSCU_APOG
  if (!lilith && typeof swisseph.SE_OSCU_APOG !== 'undefined') {
    try {
      const result = swisseph.swe_calc_ut(julianDay, swisseph.SE_OSCU_APOG, swisseph.SEFLG_SWIEPH);
      console.log(`📍 SE_OSCU_APOG: ${result.longitude}°`);
      lilith = { name: 'LILITH', longitude: result.longitude, method: 'OSCU_APOG' };
    } catch (e) {
      console.warn('⚠️ SE_OSCU_APOG failed:', e.message);
    }
  }

  // Calculate standard planet positions (including retrograde flag)
  const planetPositions = standardPlanets.map(p => {
    const result = swisseph.swe_calc_ut(julianDay, p.id, swisseph.SEFLG_SPEED);
    console.log(`🔍 ${p.name} result:`, result);
    const longitude = result.longitude;
    const speed = result.longitudeSpeed;
    const isRetro = speed < 0;

    return {
      name: p.name.toUpperCase(),
      longitude,
      retrograde: isRetro
    };
  });

  // Add North Node and Lilith if successfully calculated
  if (northNode) {
    const nodeCalc = swisseph.swe_calc_ut(julianDay, swisseph.SE_TRUE_NODE, swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED);
    const nodeSpeed = nodeCalc.longitudeSpeed;
    northNode.retrograde = nodeSpeed < 0 || true;
    planetPositions.push(northNode);
  }
  if (lilith) {
    const apoCalc = swisseph.swe_calc_ut(julianDay, swisseph.SE_MEAN_APOG, swisseph.SEFLG_SWIEPH) | swisseph.SEFLG_SPEED;
    const apoSpeed = apoCalc.longitudeSpeed;
    lilith.retrograde = apoSpeed < 0;
    planetPositions.push(lilith);
  }

  // Calculate major asteroids
  const asteroids = calculateAsteroids(julianDay);
  planetPositions.push(...asteroids);

  // Calculate fixed stars (only for natal charts, not needed for every transit)
  const fixedStars = calculateFixedStars(julianDay);
  planetPositions.push(...fixedStars);

  // If no birth time, return only planets
  if (!hasBirthTime) {
    return { planets: planetPositions };
  }

  // Calculate houses and ascendant for charts with birth time
  try {
    // Try multiple house system parameters until one works
    const hsCandidates = [
      swisseph.SE_HSYS_PLACIDUS,
      'P',
      1
    ].filter(x => typeof x !== 'undefined');
    
    let rawHouseData;
    for (const hs of hsCandidates) {
      try {
        console.log('🔧 trying swe_houses with →', hs);
        rawHouseData = swisseph.swe_houses(julianDay, lat, lon, hs);
        break;
      } catch (e) {
        console.warn(`⚠️ swe_houses failed with ${hs}, trying next…`);
      }
    }
    
    if (!rawHouseData) {
      throw new Error('All swe_houses calls failed');
    }
    
    console.log('📦 Full rawHouseData structure →', JSON.stringify(rawHouseData, null, 2));
    
    const ascendant = rawHouseData.ascendant || rawHouseData.ac || rawHouseData[0];
    const houses = rawHouseData.cusps
      || rawHouseData.houses
      || rawHouseData.house
      || (Array.isArray(rawHouseData) ? rawHouseData.slice(1,13) : []);
    
    console.log('🏠 Extracted houses & ascendant →', { ascendant, houses });

    return { ascendant, houses, planets: planetPositions };
    
  } catch (err) {
    console.error('❌ calculateFullChart error →', err);
    throw err;
  }
}

module.exports = { calcJulianDayAndCoords, calculateFullChart };