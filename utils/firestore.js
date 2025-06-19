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

/**
 * Save a conversation message to persistent storage
 * @param {string} userId e.g. "telegram-123456789"
 * @param {string} role 'user' or 'assistant'
 * @param {string} content The message content
 * @param {object} metadata Optional metadata (e.g., question type, chart reference)
 */
async function saveConversationMessage(userId, role, content, metadata = {}) {
  const messageRef = db
    .collection('users')
    .doc(userId)
    .collection('conversations')
    .doc(); // auto-generated ID

  await messageRef.set({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    role,
    content,
    metadata,
    createdAt: new Date() // For immediate sorting before server timestamp is set
  });

  return messageRef.id;
}

/**
 * Get conversation history for a user (recent messages first)
 * @param {string} userId 
 * @param {number} limit Number of recent messages to retrieve (default: 20)
 * @param {number} maxAgeDays Only get messages from last N days (default: 30)
 */
async function getConversationHistory(userId, limit = 20, maxAgeDays = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('conversations')
    .where('createdAt', '>=', cutoffDate)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  if (snapshot.empty) {
    console.log(`📭 No recent conversation history for user: ${userId}`);
    return [];
  }

  // Reverse to get chronological order (oldest first) for LLM context
  const messages = snapshot.docs.reverse().map(doc => {
    const data = doc.data();
    return {
      role: data.role,
      content: data.content,
      timestamp: data.timestamp || data.createdAt,
      metadata: data.metadata || {}
    };
  });

  console.log(`💬 Retrieved ${messages.length} conversation messages for user ${userId}`);
  return messages;
}

/**
 * Clean up old conversation messages to manage storage costs
 * @param {string} userId 
 * @param {number} keepDays Number of days to keep (default: 30)
 */
async function cleanupOldConversations(userId, keepDays = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('conversations')
    .where('createdAt', '<', cutoffDate)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`🧹 Cleaned up ${snapshot.docs.length} old conversation messages for user ${userId}`);
  return snapshot.docs.length;
}

/**
 * Get user's conversation summary/stats
 * @param {string} userId 
 */
async function getConversationStats(userId) {
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('conversations')
    .get();

  const stats = {
    totalMessages: snapshot.size,
    userMessages: 0,
    assistantMessages: 0,
    oldestMessage: null,
    newestMessage: null
  };

  if (!snapshot.empty) {
    const messages = snapshot.docs.map(doc => doc.data());
    stats.userMessages = messages.filter(m => m.role === 'user').length;
    stats.assistantMessages = messages.filter(m => m.role === 'assistant').length;
    
    const timestamps = messages.map(m => m.createdAt || m.timestamp).filter(Boolean);
    if (timestamps.length > 0) {
      stats.oldestMessage = new Date(Math.min(...timestamps.map(t => t.toDate ? t.toDate() : t)));
      stats.newestMessage = new Date(Math.max(...timestamps.map(t => t.toDate ? t.toDate() : t)));
    }
  }

  return stats;
}

module.exports = { 
  saveChart, 
  getLatestChart, 
  logInteraction,
  saveConversationMessage,
  getConversationHistory,
  cleanupOldConversations,
  getConversationStats
};