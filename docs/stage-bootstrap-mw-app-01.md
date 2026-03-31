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
- `math-tutor-frontend/.env.stage`: `VITE_APP_ENV=stage`, `VITE_API_BASE_URL`, `VITE_GATEWAY_MODE=hybrid`

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

Если `/ready` возвращает 503 — stage не считается готовым.

Дополнительные release diagnostics:

```bash
curl -fsS http://127.0.0.1:3001/runtime/version
curl -fsS http://127.0.0.1:3001/runtime/diagnostics
```

## 5) Rollback / degrade path

Быстрый откат по транспорту без отката кода:
- в `math-tutor-frontend/.env.stage`:
  - `VITE_GATEWAY_MODE=mock` (глобальный откат)
  - или точечно:
    - `VITE_GATEWAY_PURCHASES_MODE=mock`
    - `VITE_GATEWAY_BOOKINGS_MODE=mock`

После изменения env пересобрать фронтенд:

```bash
cd math-tutor-frontend
npm run build:stage
```

И перезапустить frontend процесс.

## 6) Что не входит в этот bootstrap

- полный вынос media runtime на `mw-media-01`
- production-grade infra orchestration

## 7) Media foundation notes

Подробности по media/storage foundation:
- [`docs/media-storage-foundation.md`](./media-storage-foundation.md)
- [`docs/release-hardening.md`](./release-hardening.md)
