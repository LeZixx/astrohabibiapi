const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Save a new chart document under /users/{userId}/charts/{autoId}
 * @param {string} userId      e.g. "telegram-123456789"
 * @param {object} chartData   The object you want to persist
 */
async function saveChart(userId, chartData) {
  const chartRef = db
    .collection('users')
    .doc(userId)
    .collection('charts')
    .doc(); // auto-generated ID
  await chartRef.set({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    rawChartData: chartData,
  });
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

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    chartId: doc.id,
    rawChartData: doc.data().rawChartData,
    createdAt: doc.data().createdAt,
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