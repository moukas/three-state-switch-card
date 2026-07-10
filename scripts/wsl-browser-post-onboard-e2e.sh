#!/usr/bin/env bash
set -euo pipefail

ROOT=/root/three-state-card-tools
RUN_DIR="$ROOT/run"
PROJECT=/mnt/c/DEV/HACS/three-state-switch-card
CONFIG="$PROJECT/ha-test-config"
HA_PYTHON="$ROOT/ha-2025.1.4/bin/python"
BROWSER_PYTHON="$ROOT/browser/bin/python"

mkdir -p "$RUN_DIR"
cd "$PROJECT"

rm -f "$CONFIG/.storage/auth" "$CONFIG/.storage/onboarding" 2>/dev/null || true

"$HA_PYTHON" -m homeassistant --config "$CONFIG" >"$RUN_DIR/ha-post-onboard.log" 2>&1 &
HA_PID=$!
trap 'kill "$HA_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8123/onboarding.html >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

"$PROJECT/scripts/wsl-api-onboard.sh" >"$RUN_DIR/api-onboard.out"
"$BROWSER_PYTHON" "$PROJECT/scripts/wsl-browser-smoke.py"
tail -n 30 "$RUN_DIR/ha-post-onboard.log"
