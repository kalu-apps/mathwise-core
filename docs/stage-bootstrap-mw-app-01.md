# Stage Bootstrap on `mw-app-01`

Цель: поднять `math-tutor-frontend` + `apps/api` в stage-like контуре без local/dev assumptions.

## 1) Подготовка env

Скопировать шаблоны и заполнить реальные значения:

```bash
cp apps/api/.env.stage.example apps/api/.env.stage
cp math-tutor-frontend/.env.stage.example math-tutor-frontend/.env.stage
```

Критично проверить:
- `apps/api/.env.stage`: `DATABASE_URL`, `REDIS_URL`, `AUTH_PASSWORD_PEPPER`, `API_CORS_ORIGIN`, `AUTH_COOKIE_*`, `MEDIA_STORAGE_ENABLED`, `S3_*`
- `apps/api/.env.stage`: `MEDIA_LESSON_VIDEO_MAX_UPLOAD_MB` (рекомендуемый stage-safe cap `2048`)
- `apps/api/.env.stage`: `EMAIL_DELIVERY_MODE` (`disabled` по умолчанию, `provider` только с `EMAIL_PROVIDER_API_KEY`)
- `apps/api/.env.stage`: `WORKBOOK_LAUNCH_ENABLED`, `WORKBOOK_BOARD_BASE_URL`, `WORKBOOK_LAUNCH_SECRET`
- `apps/api/.env.stage`: `PAYMENT_MOCK_ENABLED=false` и `PAYMENT_PROVIDER_AUTO_CONFIRM_LOCAL=false`
- `apps/api/.env.stage`: `STAGE_SITE_GATE_ENABLED=true`, `STAGE_SITE_GATE_SECRET` задан, `STAGE_PAYMENT_CONFIRM_ENABLED=true` (stage-gated runtime controls)
- `apps/api/.env.stage`: `COURSES_SEED_SOURCE_FILE` не должен указывать на frontend artifacts (`math-tutor-frontend/mock-db.json`)
- `math-tutor-frontend/.env.stage`: `VITE_APP_ENV=stage`, `VITE_API_BASE_URL`, `VITE_GATEWAY_MODE=http`, `VITE_STAGE_PAYMENT_CONFIRM_ENABLED=true`
- `math-tutor-frontend/.env.stage`: `VITE_LESSON_VIDEO_UPLOAD_MAX_MB=2048`

Для lesson video upload через signed S3 PUT обязательно проверить bucket CORS:
- `Origin: https://stage.mathwise.ru`
- разрешены `PUT`, `OPTIONS`
- разрешены `Content-Type` и нужные upload headers

## 2) Bootstrap (build + seed)

```bash
./scripts/stage-bootstrap-mw-app-01.sh prepare
```

Команда выполнит:
- `apps/api`: `npm run bootstrap:stage` (`build + seed:courses`)
- `math-tutor-frontend`: `npm run build:stage`

## 3) Startup order

1. Backend API:

```bash
./scripts/stage-bootstrap-mw-app-01.sh start-api
```

2. Frontend preview:

```bash
./scripts/stage-bootstrap-mw-app-01.sh start-frontend
```

## 4) Health / readiness

```bash
./scripts/stage-bootstrap-mw-app-01.sh check
```

Ожидание:
- `/health` — процесс жив
- `/ready` — `postgres=up`, `redis=up`, `media=up|disabled`

Примечание: при `MEDIA_STORAGE_ENABLED=false` storage считается `disabled` и stage остается рабочим.
Примечание: при `EMAIL_DELIVERY_MODE=disabled` письма остаются в outbox с честным статусом `dispatch_disabled` и не считаются доставленными.

Если `/ready` возвращает 503 — stage не считается готовым.

Дополнительные release diagnostics:

```bash
curl -fsS http://127.0.0.1:3001/runtime/version
curl -fsS http://127.0.0.1:3001/runtime/diagnostics
```

Frontend sanity после `start-frontend`:
- открыть stage frontend
- до входа в продукт должен открыться stage gate (secret check); это не teacher/student auth
- после прохождения gate пользователь остается неавторизованным, пока не выполнит обычный login
- в DevTools проверить `window.__MW_FRONTEND_RUNTIME__`
- ожидание:
  - `appEnv === "stage"`
  - `gatewayMode === "http"`
  - все `transports.* === "http"`
- perf diagnostics sanity:
  - на тяжелых экранах (`CourseDetails`, `CourseWithLessonsEditor`, `ChatPage`, `StudentProfile`, `TeacherDashboard`) в `document.body.dataset.perfScreen` видна текущая screen-метка
  - browser console показывает `[perf] metric:warn|error` с route/screen и значением метрики
  - при больших коллекциях появляются `[perf] collection-pressure:*` логи без постоянного спама
- booking/availability sanity:
  - teacher управляет слотами через `/api/availability/me`
  - публичный экран бронирования читает слоты через `/api/teachers/:teacherId/availability`
  - guest booking с email существующего аккаунта получает `identity_conflict_auth_required` и требует login before attach
- premium/chat/workbook sanity:
  - `/api/capabilities/me` возвращает capability source (`canChatWithTeacher`, `canAccessWorkbook`)
  - запуск рабочей тетради идет только через `POST /api/workbook/launch` -> одноразовый launch artifact
  - direct-open path без backend artifact не используется
- stage payment stub sanity:
  - `POST /api/checkouts/:checkoutId/stage-confirm` доступен только при `APP_ENV=stage`
  - экшен «Подтвердить тестовую оплату (stage)» виден только в stage checkout dialog
  - после stage confirm entitlement/provisioning проходит через обычный backend lifecycle

## 5) Rollback / degrade path

Быстрый откат без frontend embedded mock:
- в `math-tutor-frontend/.env.stage` переключить `VITE_API_BASE_URL` на предыдущий стабильный backend release
- при необходимости откатить backend на предыдущий release на `mw-app-01`
- обновить `VITE_RELEASE_VERSION` для прозрачной диагностики

После изменения env пересобрать фронтенд:

```bash
cd math-tutor-frontend
npm run build:stage
```

И перезапустить frontend процесс.

## 6) Что не входит в этот bootstrap

- полный вынос media runtime на `mw-media-01`
- production-grade infra orchestration
- teacher из seed в non-local (блокируется fail-fast; используйте только `TEACHER_BOOTSTRAP_*`)

## 7) Media foundation notes

Подробности по media/storage foundation:
- [`docs/media-storage-foundation.md`](./media-storage-foundation.md)
- [`docs/release-hardening.md`](./release-hardening.md)
