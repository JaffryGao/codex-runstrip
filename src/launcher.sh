#!/bin/bash
# Codex fork —— 双击即用：以调试模式启动 Codex，并挂上底部状态条。
# 全程静默，不弹任何窗口；状态写入日志。

set -u
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin

APP_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
LOG_DIR="$HOME/Library/Logs/Codex fork"
LOG="$LOG_DIR/launcher.log"
STATE_DIR="$HOME/Library/Application Support/Codex fork"
mkdir -p "$LOG_DIR" "$STATE_DIR"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }

# 防止重复运行（macOS 无 flock，用 mkdir 原子性做锁）
LOCKDIR="$STATE_DIR/launcher.lock.d"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  # 锁已存在：如果持有者已不在（超过 60 秒未更新），视为陈旧锁
  if [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then
    rmdir "$LOCKDIR" 2>/dev/null && mkdir "$LOCKDIR" 2>/dev/null
  fi
fi
if [ ! -d "$LOCKDIR" ]; then
  log "已有启动器在运行，退出"
  exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

# 找一个可用的 node
NODE=""
for c in "$APP_DIR/node/bin/node" /opt/homebrew/bin/node /usr/local/bin/node "$(command -v node 2>/dev/null)"; do
  [ -n "$c" ] && [ -x "$c" ] && { NODE="$c"; break; }
done
if [ -z "$NODE" ]; then
  log "找不到 node，无法注入状态条"
  exit 1
fi

CODEX_APP="${CODEX_APP_PATH:-/Applications/ChatGPT.app}"
[ -d "$CODEX_APP" ] || CODEX_APP="$HOME/Applications/ChatGPT.app"
if [ ! -d "$CODEX_APP" ]; then
  log "找不到 ChatGPT.app"
  exit 1
fi

if [ -n "${CODEX_FORK_PORTS:-}" ]; then read -r -a PORTS <<< "$CODEX_FORK_PORTS"; else PORTS=(9222 9223 9224 9225); fi

port_ready() {  # $1=port
  for host in 127.0.0.1 '[::1]'; do
    if curl -s --max-time 1 "http://${host}:$1/json/list" 2>/dev/null | grep -q 'index.html'; then
      return 0
    fi
  done
  return 1
}

codex_running() {
  pgrep -f "ChatGPT.app/Contents/MacOS/ChatGPT" >/dev/null 2>&1
}

# 1) 已经在带调试端口的实例上 —— 直接挂注入器
for p in "${PORTS[@]}"; do
  if port_ready "$p"; then
    log "复用已开启调试端口的实例 :$p"
    PORT="$p"
    break
  fi
done

# 2) Codex 在跑但没开端口 —— 静默记录，不打断当前会话
if [ -z "${PORT:-}" ] && codex_running; then
  log "Codex 正在运行但没有调试端口；本次不做任何改动（不会重启你的 Codex）"
  exit 0
fi

# 3) Codex 没在跑 —— 以调试模式启动
if [ -z "${PORT:-}" ]; then
  for p in "${PORTS[@]}"; do
    if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then PORT="$p"; break; fi
  done
  PORT="${PORT:-9222}"
  log "启动 Codex（调试端口 ${PORT}）"
  open -n -a "$CODEX_APP" --args --remote-debugging-port="$PORT"

  for _ in $(seq 1 90); do
    port_ready "$PORT" && break
    sleep 0.5
  done
  if ! port_ready "$PORT"; then
    log "启动超时：端口 $PORT 未就绪"
    exit 1
  fi
  log "Codex 已就绪 :$PORT"
fi

# 4) 注入器：已在跑就复用（按端口区分）
PIDFILE="$STATE_DIR/injector-$PORT.pid"
if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
    log "注入器已在运行（pid ${OLD}），复用"
    exit 0
  fi
fi

log "启动注入器（端口 ${PORT}）"
nohup "$NODE" "$APP_DIR/run.mjs" --port "$PORT" >>"$LOG" 2>&1 &
echo $! >"$PIDFILE"
log "注入器已启动（pid $(cat "$PIDFILE")）"
exit 0
