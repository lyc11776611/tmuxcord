#!/usr/bin/env bash
# Usage: ./bot.sh start | stop | restart | status
set -e
PIDFILE="/home/ubuntu/channel-tmux/.bot.pid"
LOGFILE="/tmp/bot.log"

stop_bot() {
  # Kill by PID file
  if [ -f "$PIDFILE" ]; then
    kill -9 "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
  # Kill any remaining instances
  pkill -9 -f "tsx.*src/index" 2>/dev/null || true
  pkill -9 -f "node.*src/index.ts" 2>/dev/null || true
  sleep 1
}

start_bot() {
  stop_bot
  cd /home/ubuntu/channel-tmux
  npx tsx src/index.ts > "$LOGFILE" 2>&1 &
  echo $! > "$PIDFILE"
  disown
  sleep 3
  if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Bot started (PID $(cat "$PIDFILE"))"
    tail -5 "$LOGFILE"
  else
    echo "Bot failed to start. Log:"
    cat "$LOGFILE"
    rm -f "$PIDFILE"
    exit 1
  fi
}

case "${1:-start}" in
  start)   start_bot ;;
  stop)    stop_bot; echo "Bot stopped" ;;
  restart) start_bot ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Running (PID $(cat "$PIDFILE"))"
    else
      echo "Not running"
    fi
    ;;
  *) echo "Usage: $0 {start|stop|restart|status}" ;;
esac
