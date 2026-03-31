# Release Hardening Checklist

## 1) Pre-release (stage)

- [ ] `apps/api/.env.stage` заполнен и не содержит dev/local значений.
- [ ] `math-tutor-frontend/.env.stage` заполнен (`VITE_APP_ENV=stage`, `VITE_GATEWAY_MODE=hybrid`).
- [ ] backend стартует без fail-fast ошибок env.
- [ ] frontend собран `npm run build:stage`.
- [ ] `/health` отвечает `200`.
- [ ] `/ready` отвечает `200`.
- [ ] `/runtime/version` отвечает и показывает ожидаемый `releaseVersion`.
- [ ] `/runtime/diagnostics` отвечает и показывает request/error counters.

## 2) Stage-to-release verification

Быстрый smoke:

```bash
./scripts/release-verify.sh
```

или вручную:

```bash
curl -fsS "$API_BASE_URL/health"
curl -fsS "$API_BASE_URL/ready"
curl -fsS "$API_BASE_URL/runtime/version"
curl -fsS "$API_BASE_URL/runtime/diagnostics"
```

Проверить вручную:
- auth/session restore/logout
- courses/lessons/access read
- purchases/bookings write flows
- media endpoints (если `MEDIA_STORAGE_ENABLED=true`)

## 3) Rollback checklist

1. Переключить проблемный домен на mock transport:
   - `VITE_GATEWAY_MODE=mock` (глобально)
   - или domain switch: `VITE_GATEWAY_PURCHASES_MODE=mock`, `VITE_GATEWAY_BOOKINGS_MODE=mock`
2. Пересобрать frontend:
   - `cd math-tutor-frontend && npm run build:stage`
3. Перезапустить frontend процесс.
4. При storage-инциденте:
   - `MEDIA_STORAGE_ENABLED=false`
   - перезапустить backend.

## 4) Recovery basics

- При `ready=503` смотреть `dependencies` в payload.
- При всплеске 5xx использовать:
  - backend logs `event=http_request` / `event=http_exception`
  - `/runtime/diagnostics` для request/error-rate.
- Для корреляции инцидентов использовать `X-Request-Id` из ответа API.
