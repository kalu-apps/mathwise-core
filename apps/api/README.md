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

Non-local policy:
- `PAYMENT_MOCK_ENABLED=false`
- `PAYMENT_PROVIDER_AUTO_CONFIRM_LOCAL=false`
- `COURSES_SEED_SOURCE_FILE` должен указывать только на backend-safe источник (frontend `mock-db.json` запрещен fail-fast проверкой).
- `STAGE_SITE_GATE_ENABLED` и `STAGE_PAYMENT_CONFIRM_ENABLED` допускаются только при `APP_ENV=stage` (fail-fast вне stage).

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
- `GET /api/stage-access/status` / `POST /api/stage-access/verify` / `POST /api/stage-access/logout` (stage site gate, runtime-flag controlled)
- `POST /api/checkouts/:checkoutId/stage-confirm` (stage confirm helper, runtime-flag controlled)

Важно:
- ручного `confirm-paid` endpoint больше нет;
- webhook требует `CARD_WEBHOOK_SECRET`, timestamp/skew и replay protection;
- provisioning (`user/profile/entitlement`) выполняется только после provider-confirmed события.
- уроки/контент отдаются в `public_preview` или `entitled_full` режиме только по backend authz.
- stage gate cookie отделен от auth session cookie и не логинит пользователя автоматически.

## Media / S3 foundation

Media runtime включается через:
- `MEDIA_STORAGE_ENABLED=true`
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

Базовые endpoints:
- `POST /api/media/upload-url`
- `POST /api/media/:id/complete`
- `GET /api/media/:id/download-url`
- `GET /api/lessons/:id/playback` (entitlement/owner-gated runtime playback access)
- `GET /api/lessons/:lessonId/materials/:materialId/access` (entitlement/owner-gated runtime material access)

Важно:
- в persisted lesson/release контенте храним stable media identity (`videoMediaObjectId`, `materials[].mediaObjectId`);
- short-lived signed URL выдаются только runtime-запросами доступа и не хранятся в release snapshot.

## Course/Test publish lifecycle

Release-контур для курсов теперь backend-owned:
- `GET /api/courses` — только active published releases (catalog)
- `GET /api/courses/:id` — для owner-teacher возвращает draft, для остальных active published release
- `POST /api/courses/:id/publish` — единая publish-команда (`idempotent`, release version bump)
- `POST /api/courses` / `PUT /api/courses/:id` / `DELETE /api/courses/:id` — draft management (teacher only)
- `GET /api/lessons*` — чтение через active release + entitlement redaction (`public_preview` vs `entitled_full`)
- `POST|PUT|DELETE /api/lessons` — draft lesson management (teacher only)
- `GET|PUT /api/assessments/state` — backend store для assessment templates/content/attempts
- `GET|PUT /api/assessments/sessions` — backend store для assessment session state
- `GET|POST|DELETE /api/progress*` — backend-owned lesson viewed progress

Ключевые инварианты:
- draft не участвует в public catalog;
- publish не сводится к клиентскому `status=published`;
- purchased/entitled users читают effective content из active release.

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
