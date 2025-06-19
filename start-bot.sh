#!/bin/bash

echo "🤖 Starting AstroHabibi Telegram Bot with auto-restart..."

while true; do
    echo "🔄 Starting bot at $(date)"
    node telegramBot.js
    
    exit_code=$?
    echo "❌ Bot stopped with exit code $exit_code at $(date)"
    
    # Wait 3 seconds before restarting
    echo "⏳ Waiting 3 seconds before restart..."
    sleep 3
done