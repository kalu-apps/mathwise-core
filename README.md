# Mathwise Core

Основной репозиторий платформы Mathwise: курсы, личные кабинеты, чаты, бронирование и учебные сценарии.

## Структура
- `math-tutor-frontend/` — фронтенд платформы.
- `apps/api/` — Nest API pilot (PostgreSQL + Redis).
- `docs/stage-bootstrap-mw-app-01.md` — stage runbook для `mw-app-01`.
- `docs/media-storage-foundation.md` — S3/media foundation и подготовка к `mw-media-01`.
- `docs/release-hardening.md` — release/rollback/stage verification checklist.

## Локальный запуск
```bash
cd math-tutor-frontend
npm install
npm run dev
```

## Проверка перед пушем
```bash
cd math-tutor-frontend
npm run verify
```

## Stage Bootstrap (`mw-app-01`)
Быстрый путь для stage-like старта:

```bash
cp apps/api/.env.stage.example apps/api/.env.stage
cp math-tutor-frontend/.env.stage.example math-tutor-frontend/.env.stage
./scripts/stage-bootstrap-mw-app-01.sh prepare
./scripts/stage-bootstrap-mw-app-01.sh start-api
./scripts/stage-bootstrap-mw-app-01.sh start-frontend
./scripts/stage-bootstrap-mw-app-01.sh check
```

Подробный runbook: [`docs/stage-bootstrap-mw-app-01.md`](docs/stage-bootstrap-mw-app-01.md)

## Связь с доской
Интерактивная доска вынесена в отдельный сервис и отдельный репозиторий.
Из core вызывается как внешний сервис (например, через кнопку «Рабочая тетрадь»).
