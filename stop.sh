#!/bin/bash
# 停止流量生成器服务
cd "$(dirname "$0")"

if [ -f .pid ]; then
  PID=$(cat .pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "服务已停止 (PID: $PID)"
  else
    echo "进程 $PID 已不存在"
  fi
  rm -f .pid
else
  echo "未找到 .pid 文件，尝试按端口查找..."
  PORT_PID=$(lsof -ti:3000 2>/dev/null)
  if [ -n "$PORT_PID" ]; then
    kill "$PORT_PID"
    echo "已停止占用 3000 端口的进程 (PID: $PORT_PID)"
  else
    echo "没有服务在运行"
  fi
fi
