# Mathwise API Pilot

Nest API для stage/pilot контура (`PostgreSQL + Redis`).

## Быстрый локальный запуск

```bash
cp .env.example .env
npm install
npm run bootstrap:stage
npm run start:dev
```

## Stage-like запуск

```bash
cp .env.stage.example .env.stage
npm run bootstrap:stage
npm run start:stage
```

## Critical commerce/auth runtime

Критический контур теперь backend-owned:
- `POST /api/purchases/checkout`
- `POST /api/purchases/checkout/attach`
- `POST /api/payments/providers/card/webhook` (provider-confirmed authority)
- `GET /api/checkouts/:checkoutId/status`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `POST /api/auth/recovery/request`
- `POST /api/auth/recovery/verify`
- `POST /api/auth/password/reset`

Важно:
- ручного `confirm-paid` endpoint больше нет;
- webhook требует `CARD_WEBHOOK_SECRET`, timestamp/skew и replay protection;
- provisioning (`user/profile/entitlement`) выполняется только после provider-confirmed события.
- уроки/контент отдаются в `public_preview` или `entitled_full` режиме только по backend authz.

## Media / S3 foundation

Media runtime включается через:
- `MEDIA_STORAGE_ENABLED=true`
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

Базовые endpoints:
- `POST /api/media/upload-url`
- `POST /api/media/:id/complete`
- `GET /api/media/:id/download-url`

## Health / readiness

- `GET /health` — liveness
- `GET /ready` — readiness (`postgres + redis`)
- `GET /runtime/version` — release/runtime version info
- `GET /runtime/diagnostics` — lightweight request/error counters

Если `/ready` возвращает `503`, backend нельзя считать готовым для stage traffic.

## Auth seed / teacher bootstrap policy

- `teacher` пользователь не может быть поднят из seed вне `APP_ENV=local`.
- В non-local teacher создается только через `TEACHER_BOOTSTRAP_*` server env.
- При нарушении этой политики backend стартует с fail-fast ошибкой.

## Notification delivery semantics

- По умолчанию: `EMAIL_DELIVERY_MODE=disabled`.
- В этом режиме outbox не маркирует письма как доставленные (`sent`), а фиксирует `dispatch_disabled`.
- Режим `provider` требует `EMAIL_PROVIDER_API_KEY` и отдельного provider adapter.
