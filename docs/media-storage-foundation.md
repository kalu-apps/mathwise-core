# Media Storage Foundation (S3-compatible)

Package 10 добавляет backend-owned media path через `apps/api` c signed URLs.

## Env (backend only)

Обязательные при `MEDIA_STORAGE_ENABLED=true`:
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

Опциональные:
- `S3_FORCE_PATH_STYLE` (`true/false`, default `true`)
- `MEDIA_SIGNED_URL_TTL_SEC` (default `900`)

По умолчанию `MEDIA_STORAGE_ENABLED=false`, чтобы stage мог стартовать без storage path.

## Endpoints

- `POST /api/media/upload-url`
  - body: `{ fileName, contentType, sizeBytes?, category? }`
  - response: `{ objectId, objectKey, uploadUrl, method, headers, expiresAt }`
- `POST /api/media/:id/complete`
  - body: `{ etag?, sizeBytes? }`
  - mark object uploaded (verifies object exists in storage)
- `GET /api/media/:id/download-url`
  - response: signed download URL
- `GET /api/lessons/:id/playback`
  - runtime playback access for entitled/owner actor
  - response: `{ lessonId, source, playbackUrl, expiresAt }`
- `GET /api/lessons/:lessonId/materials/:materialId/access`
  - runtime materials access for entitled/owner actor
  - response: `{ lessonId, materialId, source, accessUrl, expiresAt, downloadable }`

Все endpoints требуют валидную auth session cookie.

## Persisted model

В `course_lessons` и release snapshots сохраняются только стабильные media refs:
- `videoMediaObjectId`
- `materials[].mediaObjectId`

Временные signed runtime URLs больше не являются persisted source of truth для уроков/релизов.

## Upload flow

1. Клиент запрашивает signed upload URL.
2. Клиент загружает файл напрямую в S3 `PUT` по `uploadUrl`.
3. Клиент подтверждает загрузку через `POST /api/media/:id/complete`.
4. Для скачивания/просмотра клиент запрашивает signed download URL.

## Readiness

`GET /ready` теперь включает dependency `media`:
- `up` — storage доступен
- `down` — storage недоступен
- `disabled` — `MEDIA_STORAGE_ENABLED=false`

## mw-media-01 preparation

Текущая реализация уже отделяет media boundary в `apps/api/src/media/*`.
Для последующего выноса на `mw-media-01`:
- сохранить API контракт `/api/media/*`
- вынести `MediaModule` в отдельный runtime/service
- оставить `mw-app-01` как API gateway или proxy слой.
