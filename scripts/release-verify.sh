#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3001}"

HEALTH_PATH="${RELEASE_VERIFY_HEALTH_PATH:-/health}"
READY_PATH="${RELEASE_VERIFY_READY_PATH:-/ready}"
RUNTIME_VERSION_PATH="${RELEASE_VERIFY_RUNTIME_VERSION_PATH:-/runtime/version}"
RUNTIME_DIAGNOSTICS_PATH="${RELEASE_VERIFY_RUNTIME_DIAGNOSTICS_PATH:-/runtime/diagnostics}"

RUNTIME_VERSION_FALLBACK_PATH="${RELEASE_VERIFY_RUNTIME_VERSION_FALLBACK_PATH:-/api/runtime/version}"
RUNTIME_DIAGNOSTICS_FALLBACK_PATH="${RELEASE_VERIFY_RUNTIME_DIAGNOSTICS_FALLBACK_PATH:-/api/runtime/diagnostics}"

normalize_base_url() {
  local value="$1"
  value="${value%/}"
  printf '%s' "$value"
}

join_url() {
  local base_url="$1"
  local path="$2"
  if [[ "$path" != /* ]]; then
    path="/$path"
  fi
  printf '%s%s' "$base_url" "$path"
}

extract_http_code() {
  local headers_file="$1"
  awk 'toupper($1) ~ /^HTTP\// { code=$2 } END { print code }' "$headers_file"
}

extract_content_type() {
  local headers_file="$1"
  awk '
    BEGIN { IGNORECASE = 1; ct = "" }
    /^Content-Type:/ {
      ct = $0
      sub(/^[^:]*:[[:space:]]*/, "", ct)
      sub(/[[:space:]]*;.*$/, "", ct)
      gsub(/\r/, "", ct)
    }
    END { print tolower(ct) }
  ' "$headers_file"
}

verify_json_payload() {
  local mode="$1"
  local body_file="$2"

  node - "$mode" "$body_file" <<'NODE'
const fs = require("node:fs");

const mode = process.argv[2];
const bodyFile = process.argv[3];
const raw = fs.readFileSync(bodyFile, "utf8");
let payload;

try {
  payload = JSON.parse(raw);
} catch (error) {
  console.error(`[release-verify] ${mode}: invalid json payload`);
  process.exit(2);
}

const hasString = (value) => typeof value === "string" && value.trim().length > 0;
const hasFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const hasObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const checks = {
  health: () =>
    payload.ok === true &&
    hasString(payload.service) &&
    hasString(payload.releaseVersion) &&
    hasString(payload.timestamp),
  ready: () =>
    payload.ok === true &&
    hasString(payload.releaseVersion) &&
    hasObject(payload.dependencies) &&
    hasString(payload.dependencies.postgres) &&
    hasString(payload.dependencies.redis) &&
    hasString(payload.dependencies.media) &&
    hasString(payload.timestamp),
  runtimeVersion: () =>
    hasString(payload.service) &&
    hasString(payload.appEnv) &&
    hasString(payload.releaseVersion) &&
    hasFiniteNumber(payload.uptimeSec) &&
    hasString(payload.timestamp),
  runtimeDiagnostics: () =>
    hasString(payload.service) &&
    hasString(payload.appEnv) &&
    hasString(payload.releaseVersion) &&
    hasFiniteNumber(payload.uptimeSec) &&
    hasString(payload.timestamp),
};

const check = checks[mode];
if (!check) {
  console.error(`[release-verify] unknown verification mode: ${mode}`);
  process.exit(2);
}

if (!check()) {
  console.error(`[release-verify] ${mode}: json shape mismatch`);
  process.exit(2);
}
NODE
}

fetch_json_endpoint() {
  local label="$1"
  local mode="$2"
  local path="$3"

  local base_url
  base_url="$(normalize_base_url "$API_BASE_URL")"
  local url
  url="$(join_url "$base_url" "$path")"

  local headers_file
  headers_file="$(mktemp)"
  local body_file
  body_file="$(mktemp)"

  if ! curl -sS --max-time 12 -D "$headers_file" -o "$body_file" "$url"; then
    rm -f "$headers_file" "$body_file"
    return 1
  fi

  local status_code
  status_code="$(extract_http_code "$headers_file")"
  local content_type
  content_type="$(extract_content_type "$headers_file")"

  if [[ "$status_code" != "200" ]]; then
    echo "[release-verify] $label: expected HTTP 200, got ${status_code:-unknown} ($url)" >&2
    rm -f "$headers_file" "$body_file"
    return 1
  fi

  if [[ "$content_type" != "application/json" ]]; then
    echo "[release-verify] $label: expected application/json, got ${content_type:-unknown} ($url)" >&2
    rm -f "$headers_file" "$body_file"
    return 1
  fi

  verify_json_payload "$mode" "$body_file"
  cat "$body_file"

  rm -f "$headers_file" "$body_file"
  return 0
}

verify_endpoint_with_fallback() {
  local label="$1"
  local mode="$2"
  local primary_path="$3"
  local fallback_path="${4:-}"

  echo "[release-verify] $label"
  if fetch_json_endpoint "$label" "$mode" "$primary_path"; then
    echo ""
    return 0
  fi

  if [[ -n "$fallback_path" && "$fallback_path" != "$primary_path" ]]; then
    echo "[release-verify] $label: retry via fallback path $fallback_path"
    if fetch_json_endpoint "$label" "$mode" "$fallback_path"; then
      echo ""
      return 0
    fi
  fi

  return 1
}

verify_endpoint_with_fallback "health" "health" "$HEALTH_PATH"
verify_endpoint_with_fallback "ready" "ready" "$READY_PATH"
verify_endpoint_with_fallback "runtime/version" "runtimeVersion" "$RUNTIME_VERSION_PATH" "$RUNTIME_VERSION_FALLBACK_PATH"
verify_endpoint_with_fallback "runtime/diagnostics" "runtimeDiagnostics" "$RUNTIME_DIAGNOSTICS_PATH" "$RUNTIME_DIAGNOSTICS_FALLBACK_PATH"

echo "[release-verify] ok"
