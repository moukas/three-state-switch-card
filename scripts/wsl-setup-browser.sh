#!/usr/bin/env bash
set -euo pipefail

ROOT=/root/three-state-card-tools

"$ROOT/ha-2025.1.4/bin/pip" install 'urllib3<2'

if [ ! -x "$ROOT/browser/bin/python" ]; then
  python3 -m venv "$ROOT/browser"
  "$ROOT/browser/bin/pip" install --upgrade pip
  "$ROOT/browser/bin/pip" install selenium
fi

"$ROOT/ha-2025.1.4/bin/python" - <<'PY'
import urllib3
print("HA_URLLIB3", urllib3.__version__)
PY

"$ROOT/browser/bin/python" - <<'PY'
import selenium, urllib3
print("BROWSER_OK", selenium.__version__, urllib3.__version__)
PY
