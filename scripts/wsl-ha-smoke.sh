#!/usr/bin/env bash
set -euo pipefail

ROOT=/root/three-state-card-tools
RUN_DIR="$ROOT/run"
PROJECT=/mnt/c/DEV/HACS/three-state-switch-card
CONFIG="$PROJECT/ha-test-config"
PYTHON_BIN="$ROOT/ha-2025.1.4/bin/python"

mkdir -p "$RUN_DIR"
cd "$PROJECT"

nohup "$PYTHON_BIN" -m homeassistant --config "$CONFIG" >"$RUN_DIR/ha.log" 2>&1 </dev/null &
echo $! >"$RUN_DIR/ha.pid"

for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8123/ >"$RUN_DIR/index.html" 2>/dev/null; then
    curl -fsS "http://127.0.0.1:8123/local/three-state-switch-card/three-state-switch-card.js?v=0.1.0" >"$RUN_DIR/card.js"
    grep -m 1 'const CARD_VERSION = "0.1.0";' "$RUN_DIR/card.js"
    stat -c '%s' "$RUN_DIR/card.js"
    tail -n 20 "$RUN_DIR/ha.log"
    exit 0
  fi
  sleep 2
done

tail -n 80 "$RUN_DIR/ha.log"
exit 1
