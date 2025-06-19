const express = require('express');
const router = express.Router();
const { getConversationStats, cleanupOldConversations } = require('../utils/firestore');
const { cleanupUserConversations, getStorageCostEstimate } = require('../utils/conversationCleanup');

// Get conversation statistics for a user
router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const stats = await getConversationStats(userId);
    const costEstimate = await getStorageCostEstimate(userId);
    
    res.json({
      userId,
      stats,
      costEstimate
    });
  } catch (error) {
    console.error('❌ Error getting conversation stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up old conversations for a user
router.post('/cleanup/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { keepDays = 30 } = req.body;
    
    const result = await cleanupUserConversations(userId, keepDays);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('❌ Error cleaning up conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;