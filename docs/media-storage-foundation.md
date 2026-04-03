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
- `MEDIA_LESSON_VIDEO_MAX_UPLOAD_MB` (default `2048`, minimum `1024`, maximum `4096`)

По умолчанию `MEDIA_STORAGE_ENABLED=false`, чтобы stage мог стартовать без storage path.

## Endpoints

- `POST /api/media/upload-url`
  - body: `{ fileName, contentType, sizeBytes?, category? }`
  - response: `{ objectId, objectKey, uploadUrl, method, headers, expiresAt }`
- `POST /api/media/:id/complete`
  - body: `{ etag?, sizeBytes? }`
  - mark object uploaded (verifies object exists in storage)
- `POST /api/media/:id/finalize-failed`
  - marks broken finalize flow for reconciliation
  - backend moves object into safe cleanup lifecycle if it is no longer referenced
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

## Lifecycle integrity (video + materials)

- Media object lifecycle now supports safe cleanup states:
  - `pending_upload`
  - `uploaded`
  - `orphan_candidate`
  - `cleanup_pending`
  - `upload_failed`
  - `deleted`
- Detach operations (`replace/remove video`, `replace/remove materials`, `delete lessons`, `delete course`) no longer do blind immediate storage delete.
- Cleanup is reference-aware and checks distributed references before deletion:
  - draft lesson refs (`course_lessons`)
  - published release snapshots (`course_releases.lessons_snapshot_json`)
  - purchase snapshots (`profile_purchases.lessons_snapshot_json`)
- Only zero-reference objects are physically deleted from storage.

## Upload flow

1. Клиент запрашивает signed upload URL.
2. Клиент загружает файл напрямую в S3 `PUT` по `uploadUrl`.
3. Клиент подтверждает загрузку через `POST /api/media/:id/complete`.
4. Для скачивания/просмотра клиент запрашивает signed download URL.
5. Если `PUT` прошел, но `complete` не дошел/упал, клиент может вызвать `POST /api/media/:id/finalize-failed` (front does this automatically as best-effort reconcile path).

## Lesson video upload limit

- Lesson video upload limit теперь задается backend/env через `MEDIA_LESSON_VIDEO_MAX_UPLOAD_MB`.
- Frontend использует согласованный stage-safe cap через `VITE_LESSON_VIDEO_UPLOAD_MAX_MB` (default `2048`).
- При превышении лимита backend возвращает `413` с `code=lesson_video_too_large`.

## Stage CORS requirement (S3 boundary)

Для direct browser PUT на signed URL S3 bucket обязан разрешать CORS preflight от frontend origin (`https://stage.mathwise.ru`).
Если CORS не настроен, upload блокируется браузером до `complete` шага.
Teacher-facing UI при этом показывает нейтральную ошибку, а подробная диагностика остается в console/runtime logs.

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
