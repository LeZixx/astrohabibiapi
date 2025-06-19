// Conversation cleanup utility for cost management
const { cleanupOldConversations, getConversationStats } = require('./firestore');

/**
 * Clean up old conversations for all users to manage storage costs
 * This should be run periodically (e.g., daily via cron job)
 */
async function performCleanup(keepDays = 30) {
  console.log(`🧹 Starting conversation cleanup - keeping last ${keepDays} days`);
  
  // In a production system, you'd want to iterate through users
  // For now, this is a utility that can be called manually or via scheduled task
  
  // TODO: Add batch processing for all users when needed
  console.log('⚠️ Note: This cleanup function needs to be called per user');
  console.log('Example usage: cleanupUserConversations("telegram-123456789")');
}

/**
 * Clean up conversations for a specific user
 */
async function cleanupUserConversations(userId, keepDays = 30) {
  try {
    const stats = await getConversationStats(userId);
    console.log(`📊 User ${userId} conversation stats:`, stats);
    
    const deletedCount = await cleanupOldConversations(userId, keepDays);
    
    if (deletedCount > 0) {
      console.log(`✅ Cleaned up ${deletedCount} old messages for user ${userId}`);
      
      // Get updated stats
      const newStats = await getConversationStats(userId);
      console.log(`📊 Updated stats:`, newStats);
      
      return {
        userId,
        deletedMessages: deletedCount,
        beforeStats: stats,
        afterStats: newStats
      };
    } else {
      console.log(`✨ No old messages to clean up for user ${userId}`);
      return {
        userId,
        deletedMessages: 0,
        beforeStats: stats,
        afterStats: stats
      };
    }
  } catch (error) {
    console.error(`❌ Failed to cleanup conversations for user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Get storage cost estimate for conversations
 */
async function getStorageCostEstimate(userId) {
  try {
    const stats = await getConversationStats(userId);
    
    // Rough estimate: assume average message is 200 characters
    const estimatedBytes = stats.totalMessages * 200;
    const estimatedMB = estimatedBytes / (1024 * 1024);
    
    // Firestore pricing: $0.18 per GB/month
    const estimatedMonthlyCost = (estimatedMB / 1024) * 0.18;
    
    return {
      userId,
      totalMessages: stats.totalMessages,
      estimatedMB: estimatedMB.toFixed(2),
      estimatedMonthlyCost: estimatedMonthlyCost.toFixed(4),
      stats
    };
  } catch (error) {
    console.error(`❌ Failed to estimate storage cost for user ${userId}:`, error.message);
    throw error;
  }
}

module.exports = {
  performCleanup,
  cleanupUserConversations,
  getStorageCostEstimate
};