# Math Tutor Platform (Core, private)

Этот репозиторий — основной приватный `core` проекта.

## Что внутри
- `math-tutor-frontend/` — полный рабочий проект (источник правды)
- `portfolio/` — инструменты и шаблоны для публикации витринных showcase-репозиториев

## Базовый workflow
1. Все изменения вносятся в `core` ежедневно.
2. Коммиты делаются логическими порциями (`feat/fix/refactor/docs`).
3. Раз в неделю из `core` экспортируются showcase-репозитории.
4. Витринные репозитории обновляются только стабильными срезами.
5. Для showcase ведётся отдельный changelog: что добавлено/исправлено.

## Команды
```bash
cd math-tutor-frontend
npm install
npm run dev
```

Экспорт showcase-репозиториев:
```bash
cd math-tutor-frontend
node ../portfolio/scripts/export-showcases.mjs
```

Еженедельный release-срез showcase:
```bash
./portfolio/scripts/create-showcase-release-branch.sh <версия>
node portfolio/scripts/release-showcases.mjs
```

Конфиг релиза:
- `portfolio/releases/showcase-release.config.json`
- пример: `portfolio/releases/showcase-release.config.example.json`

## Документация для портфолио
- `portfolio/docs/REPOSITORY_MAP_RU.md`
- `portfolio/docs/WORKFLOW_RU.md`
- `portfolio/docs/PUBLICATION_CHECKLIST_RU.md`
- `portfolio/docs/GITHUB_PUBLISH_STEPS_RU.md`
- `portfolio/docs/SHOWCASE_RELEASE_PROCESS_RU.md`

## Публичные showcase-репозитории
- Публикуются как витрина, а не как полный продукт.
- В каждый showcase автоматически добавляются:
  - `LICENSE`
  - `SHOWCASE_NOTICE.md`
- Внутренние служебные артефакты (`.github`, `.vscode`, `docs`, `reports`) не экспортируются.
