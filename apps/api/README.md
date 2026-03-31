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
