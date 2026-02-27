#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Использование: ./portfolio/scripts/create-showcase-release-branch.sh <версия>"
  echo "Пример: ./portfolio/scripts/create-showcase-release-branch.sh 2026.03.W10"
  exit 1
fi

cd "$ROOT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Рабочее дерево не чистое. Сначала закоммитьте или уберите изменения."
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "Скрипт нужно запускать из ветки main. Сейчас: $CURRENT_BRANCH"
  exit 1
fi

BRANCH_NAME="codex/release-showcase-${VERSION}"

if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  echo "Ветка уже существует: ${BRANCH_NAME}"
  exit 1
fi

git checkout -b "$BRANCH_NAME"

echo "Создана ветка: ${BRANCH_NAME}"
echo "Дальше:"
echo "1) обновите portfolio/releases/showcase-release.config.json"
echo "2) выполните node portfolio/scripts/release-showcases.mjs"
echo "3) проверьте showcase"
echo "4) после проверки влейте ветку в main"
