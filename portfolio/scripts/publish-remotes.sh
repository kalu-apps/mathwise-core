#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OWNER="${GITHUB_OWNER:-kalu-apps}"
TOKEN="${GITHUB_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "GITHUB_TOKEN не задан."
  echo "Пример: GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=kalu-apps ./portfolio/scripts/publish-remotes.sh"
  exit 1
fi

api_create_repo() {
  local name="$1"
  local private="$2"
  local description="$3"

  local payload
  payload=$(cat <<JSON
{"name":"$name","private":$private,"description":"$description"}
JSON
)

  local code
  code=$(curl -sS -o /tmp/github-create-repo.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/user/repos \
    -d "$payload")

  if [[ "$code" == "201" ]]; then
    echo "✔ создан репозиторий: $name"
  elif [[ "$code" == "422" ]]; then
    echo "ℹ репозиторий уже существует: $name"
  else
    echo "✖ не удалось создать репозиторий $name (HTTP $code)"
    cat /tmp/github-create-repo.json
    exit 1
  fi
}

prepare_remote_and_push() {
  local repo_path="$1"
  local repo_name="$2"
  local remote_url="https://github.com/$OWNER/$repo_name.git"

  cd "$repo_path"
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$remote_url"
  else
    git remote add origin "$remote_url"
  fi
  git push -u origin main
}

# 1) Создать репозитории
api_create_repo "math-tutor-platform-core" true "Основной приватный репозиторий платформы"
api_create_repo "math-whiteboard-demo" false "Портфолио-демо: интерактивная математическая whiteboard"
api_create_repo "math-realtime-lesson-demo" false "Портфолио-демо: realtime-коллективный урок"
api_create_repo "math-axiom-assistant-demo" false "Портфолио-демо: ассистент Аксиом"

# 2) Пуш core
prepare_remote_and_push "$ROOT_DIR" "math-tutor-platform-core"

# 3) Пуш showcase
prepare_remote_and_push "$ROOT_DIR/portfolio-repos/math-whiteboard-demo" "math-whiteboard-demo"
prepare_remote_and_push "$ROOT_DIR/portfolio-repos/math-realtime-lesson-demo" "math-realtime-lesson-demo"
prepare_remote_and_push "$ROOT_DIR/portfolio-repos/math-axiom-assistant-demo" "math-axiom-assistant-demo"

echo "Готово: все репозитории опубликованы и запушены."
