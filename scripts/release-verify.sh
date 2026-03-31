#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3001}"

echo "[release-verify] health"
curl -fsS "$API_BASE_URL/health"
echo ""

echo "[release-verify] ready"
curl -fsS "$API_BASE_URL/ready"
echo ""

echo "[release-verify] runtime/version"
curl -fsS "$API_BASE_URL/runtime/version"
echo ""

echo "[release-verify] runtime/diagnostics"
curl -fsS "$API_BASE_URL/runtime/diagnostics"
echo ""

echo "[release-verify] ok"
