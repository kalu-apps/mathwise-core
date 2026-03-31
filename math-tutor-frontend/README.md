# Mathwise Core Frontend

Фронтенд основной платформы Mathwise.

## Скрипты
- `npm run dev` — запуск локального dev-сервера
- `npm run dev:https` — запуск dev-сервера через HTTPS
- `npm run lint` — проверка ESLint
- `npm run build` — production-сборка
- `npm run verify` — `lint + build`
- `npm run preview` — просмотр production-сборки

## Быстрый старт
```bash
npm install
npm run dev
```

## Stage-like запуск
```bash
cp .env.stage.example .env.stage
npm run build:stage
npm run start:stage
```

Ключевые env:
- `VITE_APP_ENV=stage`
- `VITE_API_BASE_URL=https://<api-host>/api`
- `VITE_GATEWAY_MODE=http`
- `VITE_RELEASE_VERSION=<release-tag>`
- `VITE_BUILD_SOURCEMAP=1` (для stage diagnostics)

Emergency fallback (временно, только при инциденте):
- переключить `VITE_API_BASE_URL` на стабильный предыдущий backend release
- обновить `VITE_RELEASE_VERSION` и пересобрать фронтенд
