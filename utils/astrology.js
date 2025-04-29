const swisseph = require('swisseph');
const { DateTime } = require('luxon');
const axios = require('axios');
const tzlookup = require('tz-lookup');

async function calcJulianDayAndCoords(birthDate, birthTime, birthPlace) {
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

 // console.log(
  //  '🛠️ [astrology] raw JD(UT)=', jd,
    //'ΔT(sec)=', deltaT,
    //'JD(TT)=', julianDayTT,
    //'parsed dt =', dt.toISO(),
    //'zone =', zone
 // );


  const result = { julianDay: julianDayTT, lat, lon };
  console.log('🛠️ [astrology] calcJulianDayAndCoords result =', result);
  return result;

}

function calculateFullChart(julianDay, lat, lon) {
  // 1. Compute house cusps and ascendant
  const houseData = swisseph.swe_houses(julianDay, 0, lat, lon);
  const ascendant = houseData.ascendant;
  const houses = houseData.cusps;
  // 2. Compute planet positions
  const planets = ['SE_SUN','SE_MOON','SE_MERCURY','SE_VENUS','SE_MARS','SE_JUPITER','SE_SATURN','SE_URANUS','SE_NEPTUNE','SE_PLUTO'];
  const planetPositions = planets.map(p => {
    const lonlat = swisseph.swe_calc_ut(julianDay, swisseph[p], swisseph.SEFLG_SWIEPH);
    return { name: p.replace('SE_',''), longitude: lonlat.longitude };
  });
  return { ascendant, houses, planets: planetPositions };
}

module.exports = { calcJulianDayAndCoords, calculateFullChart };