#!/usr/bin/env bash
set -euo pipefail

BASE=http://127.0.0.1:8123

curl -fsS "$BASE/api/onboarding" > /root/three-state-card-tools/run/onboarding-status-before.json
curl -fsS -X POST "$BASE/api/onboarding/users" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Codex Test","username":"codex","password":"codex-test-1234","client_id":"http://127.0.0.1:8123/","language":"en"}' \
  > /root/three-state-card-tools/run/onboarding-user.json
curl -fsS -X POST "$BASE/api/onboarding/core_config" -H 'Content-Type: application/json' -d '{}' \
  > /root/three-state-card-tools/run/onboarding-core.json
curl -fsS -X POST "$BASE/api/onboarding/analytics" -H 'Content-Type: application/json' -d '{}' \
  > /root/three-state-card-tools/run/onboarding-analytics.json
curl -fsS "$BASE/api/onboarding" > /root/three-state-card-tools/run/onboarding-status-after.json

cat /root/three-state-card-tools/run/onboarding-status-after.json
