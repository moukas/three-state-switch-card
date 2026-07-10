#!/usr/bin/env bash
set -euo pipefail

ROOT=/root/three-state-card-tools

mkdir -p "$ROOT"
cd "$ROOT"

if [ ! -x node-v22.17.0-linux-x64/bin/node ]; then
  curl -fsSLO https://nodejs.org/dist/v22.17.0/node-v22.17.0-linux-x64.tar.xz
  tar -xf node-v22.17.0-linux-x64.tar.xz
fi

if [ ! -x ha-2025.1.4/bin/python ]; then
  python3 -m venv ha-2025.1.4
  ha-2025.1.4/bin/pip install --upgrade pip
  ha-2025.1.4/bin/pip install homeassistant==2025.1.4
fi

./node-v22.17.0-linux-x64/bin/node -v
./ha-2025.1.4/bin/python -c 'from importlib.metadata import version; print(version("homeassistant"))'
