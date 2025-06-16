const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Save a new chart document under /users/{userId}/charts/{autoId}
 * @param {string} userId e.g. "telegram-123456789"
 * @param {object} chartData The object you want to persist
 */
async function saveChart(userId, chartData) {
  // Validate that we have the required data
  if (!chartData.planets || !Array.isArray(chartData.planets)) {
    console.error(`❌ Invalid chart data: missing planets array`);
    throw new Error('Chart data must include planets array');
  }

  if (chartData.hasExactTime && (!Array.isArray(chartData.houses) || chartData.houses.length !== 12)) {
    console.error(`❌ Invalid houses array length: ${chartData.houses?.length}`);
    throw new Error('Chart data must include exactly 12 house cusps');
  }

  const chartRef = db
    .collection('users')
    .doc(userId)
    .collection('charts')
    .doc(); // auto-generated ID

  await chartRef.set({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    rawChartData: chartData,
    // Also store flattened data for easier access
    julianDay: chartData.julianDay,
    lat: chartData.lat,
    lon: chartData.lon,
    ascendant: chartData.ascendant,
    risingSign: chartData.risingSign,
    houses: chartData.houses,
    planets: chartData.planets,
    hasExactTime: chartData.hasExactTime
  });

  console.log(`✅ Chart saved with ID: ${chartRef.id} for user: ${userId}`);
  return chartRef.id;
}

/**
 * Fetch the most recent chart for a given userId
 * @param {string} userId
 * @returns {Promise<{ chartId: string, rawChartData: object, createdAt: FirebaseFirestore.Timestamp } | null>}
 */
async function getLatestChart(userId) {
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('charts')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log(`❌ No charts found for user: ${userId}`);
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  
  // Ensure we return the complete chart data
  const chartData = data.rawChartData || {
    julianDay: data.julianDay,
    lat: data.lat,
    lon: data.lon,
    ascendant: data.ascendant,
    risingSign: data.risingSign,
    houses: data.houses,
    planets: data.planets,
    hasExactTime: data.hasExactTime
  };

  console.log(`✅ Retrieved chart ${doc.id} for user ${userId}`);
  console.log(`📊 Chart has ${chartData.planets?.length} planets, ${chartData.houses?.length || 0} houses`);
  
  return {
    chartId: doc.id,
    rawChartData: chartData,
    createdAt: data.createdAt,
  };
}

/**
 * Log a follow-up interaction (question or response) under /users/{userId}/logs/{autoId}
 * @param {string} userId
 * @param {'question'|'response'} type
 * @param {string} content
 */
async function logInteraction(userId, type, content) {
  const logRef = db
    .collection('users')
    .doc(userId)
    .collection('logs')
    .doc(); // auto-generated ID

  await logRef.set({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    type,
    content,
  });

  return logRef.id;
}

module.exports = { saveChart, getLatestChart, logInteraction };