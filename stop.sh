#!/bin/bash
# 停止流量生成器服务（pm2）
pm2 delete browserbase-bot 2>/dev/null
echo "服务已停止"
