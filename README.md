# Mathwise Core

Основной репозиторий платформы Mathwise: курсы, личные кабинеты, чаты, бронирование и учебные сценарии.

## Структура
- `math-tutor-frontend/` — фронтенд платформы.
- `apps/api/` — Nest API pilot (PostgreSQL + Redis).
- `docs/stage-bootstrap-mw-app-01.md` — stage runbook для `mw-app-01`.
- `docs/media-storage-foundation.md` — S3/media foundation и подготовка к `mw-media-01`.
- `docs/release-hardening.md` — release/rollback/stage verification checklist.

## Локальный запуск
```bash
cp apps/api/.env.example apps/api/.env
cd apps/api
npm install
npm run bootstrap:stage
npm run dev

cd ../../math-tutor-frontend
npm install
npm run dev
```

Frontend работает только через `apps/api` (embedded mock runtime удален).

## Проверка перед пушем
```bash
cd math-tutor-frontend
npm run verify
```

Для release candidate дополнительно:

```bash
cd apps/api
npm run typecheck
npm run test
npm run build
```

## Stage Bootstrap (`mw-app-01`)
Быстрый путь для stage-like старта:

```bash
cp apps/api/.env.stage.example apps/api/.env.stage
cp math-tutor-frontend/.env.stage.example math-tutor-frontend/.env.stage
./scripts/stage-bootstrap-mw-app-01.sh prepare
./scripts/stage-bootstrap-mw-app-01.sh start-api
./scripts/stage-bootstrap-mw-app-01.sh start-frontend
./scripts/stage-bootstrap-mw-app-01.sh check
```

Критичная stage policy:
- `apps/api/.env.stage`: `PAYMENT_MOCK_ENABLED=false`, `PAYMENT_PROVIDER_AUTO_CONFIRM_LOCAL=false`
- `apps/api/.env.stage`: `COURSES_SEED_SOURCE_FILE` не должен ссылаться на frontend artifacts (`math-tutor-frontend/mock-db.json`)
- `apps/api/.env.stage`: `STAGE_SITE_GATE_ENABLED=true` только в `APP_ENV=stage` (отдельный site-access gate, не user auth)
- `apps/api/.env.stage`: `STAGE_PAYMENT_CONFIRM_ENABLED=true` только в `APP_ENV=stage` (временный backend stub для test confirm, без mock-provider)
- `math-tutor-frontend/.env.stage`: `VITE_STAGE_PAYMENT_CONFIRM_ENABLED=true` только для stage UI

Подробный runbook: [`docs/stage-bootstrap-mw-app-01.md`](docs/stage-bootstrap-mw-app-01.md)

## Artifact Deploy (Core Staging)
Для server-side деплоя без локальной сборки на сервере:

```bash
cd /opt/mathwise/core-staging
set -a
. /etc/mathwise/deploy-gh.env
set +a

DEPLOY_GH_REPO='kalu-apps/mathwise-core' \
DEPLOY_GH_BRANCH='staging' \
DEPLOY_GH_WORKFLOW='build-core-artifact.yml' \
DEPLOY_GH_ARTIFACT_NAME='core-runtime-staging' \
DEPLOY_API_BASE_URL='https://stage.mathwise.ru' \
DEPLOY_RESTART_API_CMD='systemctl restart mathwise-core-staging-api.service' \
DEPLOY_RESTART_FRONTEND_CMD='systemctl restart mathwise-core-staging-frontend.service' \
DEPLOY_RELOAD_NGINX_CMD='systemctl reload nginx' \
npm run deploy:release
```

Скрипты:
- `npm run deploy:artifact` — скачать последний успешный GitHub artifact и атомарно применить runtime payload (`apps/api/dist`, `apps/api/node_modules`, `math-tutor-frontend/dist`).
- `npm run deploy:safe-restart` — рестарт сервисов + readiness/smoke check.

## Связь с доской
Интерактивная доска вынесена в отдельный сервис и отдельный репозиторий.
Из core вызывается через backend-gated handoff:
- frontend запрашивает `POST /api/workbook/launch`
- backend проверяет session + capability (`canAccessWorkbook`)
- backend выдает короткоживущий launch artifact
- board открывается только через artifact path `GET /api/workbook/launch/:artifactId`
