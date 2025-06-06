const swisseph = require('swisseph');
const path = require('path');
swisseph.swe_set_ephe_path(path.join(__dirname, '../ephe'));
const { DateTime } = require('luxon');
const axios = require('axios');
const tzlookup = require('tz-lookup');

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
  // Calculate standard planet positions (including retrograde flag)
  const planetPositions = standardPlanets.map(p => {
    const result = swisseph.swe_calc_ut(julianDay, p.id, swisseph.SEFLG_SWIEPH);
    const longitude = result[0];
    const speed = result[3];
    const isRetro = speed < 0;
    return {
      name: p.name.toUpperCase(),
      longitude,
      retrograde: isRetro
    };
  });

  // Add North Node and Lilith if successfully calculated
  if (northNode) {
    const nodeCalc = swisseph.swe_calc_ut(julianDay, swisseph.SE_TRUE_NODE, swisseph.SEFLG_SWIEPH);
    const nodeSpeed = nodeCalc[3];
    northNode.retrograde = nodeSpeed < 0;
    planetPositions.push(northNode);
  }
  if (lilith) {
    const apoCalc = swisseph.swe_calc_ut(julianDay, swisseph.SE_MEAN_APOG, swisseph.SEFLG_SWIEPH);
    const apoSpeed = apoCalc[3];
    lilith.retrograde = apoSpeed < 0;
    planetPositions.push(lilith);
  }

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