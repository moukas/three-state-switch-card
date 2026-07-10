#!/usr/bin/env bash
set -euo pipefail

PROJECT=/mnt/c/DEV/HACS/three-state-switch-card
CONFIG="$PROJECT/ha-test-config"
ROOT=/root/three-state-card-tools

mkdir -p "$ROOT/run"
pkill -f 'homeassistant --config /mnt/c/DEV/HACS/three-state-switch-card/ha-test-config' 2>/dev/null || true

setsid "$ROOT/ha-2025.1.4/bin/python" -m homeassistant --config "$CONFIG" >"$ROOT/run/ha-live.log" 2>&1 < /dev/null &
echo $! >"$ROOT/run/ha-live.pid"

for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8123/ >/dev/null 2>&1; then
    echo READY
    exit 0
  fi
  sleep 2
done

tail -n 80 "$ROOT/run/ha-live.log"
exit 1
