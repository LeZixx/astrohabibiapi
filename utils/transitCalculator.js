

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

/**
 * Compute live transits for a natal chart.
 * @param {Object} chartData - must include a planets array with { name, longitude }.
 * @returns {Array} transit objects { name, currentLongitude, speed, retrograde, aspects }.
 */
async function getLiveTransits(chartData) {
  if (!chartData || !Array.isArray(chartData.planets)) {
    throw new Error('Missing natal chart data (chartData.planets)');
  }
  const jdNow = getTodayJulianDay();
  // use SWIEPH ephemeris, include speed and equatorial coordinates
  const flag = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED | swisseph.SEFLG_EQUATORIAL;
  const majorAspects = [0, 60, 90, 120, 180];
  const orb = 5; // degrees tolerance

  // build transitData array
  const transitData = chartData.planets.map(natal => {
    const constName = 'SE_' + natal.name.replace(/\s+/g, '_').toUpperCase();
    const id = swisseph[constName];
    if (typeof id !== 'number') return null;
    const result = swisseph.swe_calc_ut(jdNow, id, flag);
    const { longitude, speed, rflag } = result;
    const retrograde = speed < 0;
    // find aspects to natal positions
    const aspects = [];
    chartData.planets.forEach(other => {
      let diff = Math.abs((longitude - other.longitude + 360) % 360);
      if (diff > 180) diff = 360 - diff;
      majorAspects.forEach(angle => {
        if (Math.abs(diff - angle) <= orb) {
          aspects.push(`${natal.name} ${angle}° ${other.name}`);
        }
      });
    });
    return { name: natal.name, currentLongitude: longitude, speed, retrograde, aspects };
  }).filter(Boolean);

  return transitData;
}

module.exports = { getLiveTransits };