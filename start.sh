#!/bin/bash
# 启动流量生成器服务
cd "$(dirname "$0")"

# 停止已有进程
if [ -f .pid ]; then
  OLD_PID=$(cat .pid)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID"
    echo "已停止旧进程 (PID: $OLD_PID)"
    sleep 1
  fi
  rm -f .pid
fi

# 后台启动
nohup node server.js > server.log 2>&1 &
echo $! > .pid
echo "服务已启动 (PID: $!)"
echo "日志: server.log"
echo "控制台: http://localhost:3000"
