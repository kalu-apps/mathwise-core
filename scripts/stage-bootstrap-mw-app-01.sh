#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
FRONTEND_DIR="$ROOT_DIR/math-tutor-frontend"

API_ENV_FILE="${API_ENV_FILE:-$API_DIR/.env.stage}"
FRONTEND_ENV_FILE="${FRONTEND_ENV_FILE:-$FRONTEND_DIR/.env.stage}"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

prepare() {
  load_env_file "$API_ENV_FILE"
  load_env_file "$FRONTEND_ENV_FILE"

  npm --prefix "$API_DIR" run bootstrap:stage
  npm --prefix "$FRONTEND_DIR" run build:stage
}

start_api() {
  load_env_file "$API_ENV_FILE"
  npm --prefix "$API_DIR" run start:stage
}

start_frontend() {
  load_env_file "$FRONTEND_ENV_FILE"
  npm --prefix "$FRONTEND_DIR" run start:stage
}

check_ready() {
  load_env_file "$API_ENV_FILE"
  local base_url="${API_BASE_URL:-http://127.0.0.1:${API_PORT:-3001}}"
  curl -fsS "$base_url/health"
  echo ""
  curl -fsS "$base_url/ready"
  echo ""
  curl -fsS "$base_url/runtime/version"
  echo ""
  curl -fsS "$base_url/runtime/diagnostics"
  echo ""
}

usage() {
  cat <<'EOF'
Usage:
  scripts/stage-bootstrap-mw-app-01.sh prepare
  scripts/stage-bootstrap-mw-app-01.sh start-api
  scripts/stage-bootstrap-mw-app-01.sh start-frontend
  scripts/stage-bootstrap-mw-app-01.sh check

Environment overrides:
  API_ENV_FILE=/path/to/apps/api/.env.stage
  FRONTEND_ENV_FILE=/path/to/math-tutor-frontend/.env.stage
  API_BASE_URL=http://127.0.0.1:3001
EOF
}

command="${1:-}"
case "$command" in
  prepare)
    prepare
    ;;
  start-api)
    start_api
    ;;
  start-frontend)
    start_frontend
    ;;
  check)
    check_ready
    ;;
  *)
    usage
    exit 1
    ;;
esac
