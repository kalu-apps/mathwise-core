# Release Hardening Checklist

## 0) Release candidate quality gate (must be green)

```bash
cd math-tutor-frontend
npm run lint
npm run typecheck
npm run test
npm run build
npm run build:stage

cd ../apps/api
npm run typecheck
npm run test
npm run build
```

Примечание: предупреждение Vite про большой chunk не является blocker при green build.  
Optimization/budget work — отдельный пакет после релиза.

## 1) Pre-release (stage)

- [ ] `apps/api/.env.stage` заполнен и не содержит dev/local значений.
- [ ] `math-tutor-frontend/.env.stage` заполнен (`VITE_APP_ENV=stage`, `VITE_GATEWAY_MODE=http`).
- [ ] backend стартует без fail-fast ошибок env.
- [ ] frontend собран `npm run build:stage`.
- [ ] `/health` отвечает `200`.
- [ ] `/ready` отвечает `200`.
- [ ] `/runtime/version` отвечает и показывает ожидаемый `releaseVersion`.
- [ ] `/runtime/diagnostics` отвечает и показывает request/error counters.
- [ ] `EMAIL_DELIVERY_MODE` настроен осознанно:
  - `disabled` — честно без fake-delivered статусов;
  - `provider` — только с валидным `EMAIL_PROVIDER_API_KEY` и включенным adapter.
- [ ] `COURSES_SEED_ON_BOOT=true` в non-local не содержит `teacher` в seed source.
- [ ] `WORKBOOK_LAUNCH_ENABLED=true` в stage/prod сопровождается валидными `WORKBOOK_BOARD_BASE_URL` и `WORKBOOK_LAUNCH_SECRET`.
- [ ] `/api/capabilities/me` возвращает feature flags и не зависит от price-эвристик на клиенте.

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
- draft не виден в public catalog (`GET /api/courses`)
- publish проходит только через `POST /api/courses/:id/publish` (без client-driven status flip)
- после publish у purchased user доступен новый active release без потери entitlement
- non-entitled actor не получает full lesson payload (`videoUrl/materials`) в `GET /api/lessons*` и `GET /api/access/lessons/:id`
- progress parity: student/teacher читают backend `/api/progress` источник, а не локальные вычисления
- purchases/bookings write flows
- booking/availability lifecycle:
  - публичная запись не принимает `studentId`
  - для existing email в guest-flow backend возвращает `identity_conflict_auth_required` (без silent attach)
  - teacher availability управляется только через `GET/PUT /api/availability/me`
  - public slots читаются через `GET /api/teachers/:teacherId/availability`
  - отмена/перенос меняют статус (`scheduled/rescheduled/canceled/...`), а не удаляют историю
- media endpoints (если `MEDIA_STORAGE_ENABLED=true`)
- capability + premium gates:
  - non-premium student получает `canChatWithTeacher=false`, `canAccessWorkbook=false`
  - premium student получает `canChatWithTeacher=true`, `canAccessWorkbook=true`
  - после refund/revoke флаги и доступ к chat/workbook снимаются
- workbook handoff:
  - `POST /api/workbook/launch` выдает short-lived artifact только для разрешенного пользователя
  - `GET /api/workbook/launch/:artifactId` одноразовый (replay blocked)
- frontend runtime diagnostics в браузере:
  - `window.__MW_FRONTEND_RUNTIME__` существует
  - `appEnv=stage`
  - все `transports=*http`

## 3) Rollback checklist

1. Переключить `VITE_API_BASE_URL` на стабильный предыдущий backend release.
2. При необходимости откатить backend deployment до предыдущего release.
3. Пересобрать frontend:
   - `cd math-tutor-frontend && npm run build:stage`
4. Перезапустить frontend процесс.
5. При storage-инциденте:
   - `MEDIA_STORAGE_ENABLED=false`
   - перезапустить backend.

## 4) Recovery basics

- При `ready=503` смотреть `dependencies` в payload.
- При всплеске 5xx использовать:
  - backend logs `event=http_request` / `event=http_exception`
  - `/runtime/diagnostics` для request/error-rate.
- Для корреляции инцидентов использовать `X-Request-Id` из ответа API.
