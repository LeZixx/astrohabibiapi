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

async function calculateFullChart({ julianDay, lat, lon }) {
  console.log('🔍 calculateFullChart input →', { julianDay, lat, lon });
  console.log('🔍 Available swisseph constants →', Object.keys(swisseph));
  console.log('🔍 SE_HSYS_PLACIDUS value →', swisseph.SE_HSYS_PLACIDUS);
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

    // 2. Compute planet positions (including True Node and Black Moon Lilith)
    // Determine correct constants for North Node (true node preferred) and Lilith (osculating apogee preferred)
    const northNodeId = typeof swisseph.SE_TRUE_NODE !== 'undefined'
      ? swisseph.SE_TRUE_NODE
      : (typeof swisseph.SE_NNODE !== 'undefined'
          ? swisseph.SE_NNODE
          : (typeof swisseph.SE_MEAN_NODE !== 'undefined'
              ? swisseph.SE_MEAN_NODE
              : null));
    const lilithId = typeof swisseph.SE_OSCU_APOG !== 'undefined'
      ? swisseph.SE_OSCU_APOG
      : (typeof swisseph.SE_TRUE_LILITH !== 'undefined'
          ? swisseph.SE_TRUE_LILITH
          : null);

    const planetConstants = [
      { name: 'Sun',        id: swisseph.SE_SUN },
      { name: 'Moon',       id: swisseph.SE_MOON },
      { name: 'Mercury',    id: swisseph.SE_MERCURY },
      { name: 'Venus',      id: swisseph.SE_VENUS },
      { name: 'Mars',       id: swisseph.SE_MARS },
      { name: 'Jupiter',    id: swisseph.SE_JUPITER },
      { name: 'Saturn',     id: swisseph.SE_SATURN },
      { name: 'Uranus',     id: swisseph.SE_URANUS },
      { name: 'Neptune',    id: swisseph.SE_NEPTUNE },
      { name: 'Pluto',      id: swisseph.SE_PLUTO },
      ...(northNodeId ? [{ name: 'North Node', id: northNodeId }] : []),
      ...(lilithId     ? [{ name: 'Lilith',      id: lilithId      }] : []),
    ];

    const planetPositions = planetConstants.map(p => {
      const lonlat = swisseph.swe_calc_ut(julianDay, p.id, swisseph.SEFLG_SWIEPH);
      return { name: p.name.toUpperCase(), longitude: lonlat.longitude };
    });

    return { ascendant, houses, planets: planetPositions };
  } catch (err) {
    console.error('❌ calculateFullChart error →', err);
    throw err;
  }
}

module.exports = { calcJulianDayAndCoords, calculateFullChart };