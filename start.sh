#!/bin/bash
# 启动流量生成器服务（pm2）
cd "$(dirname "$0")"

# 停止已有进程
pm2 delete browserbase-bot 2>/dev/null

# 启动
pm2 start server.js --name browserbase-bot
echo "服务已启动"
echo "控制台: http://localhost:3000"
echo "日志: pm2 logs browserbase-bot"
