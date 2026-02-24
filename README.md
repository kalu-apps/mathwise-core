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

## Документация для портфолио
- `portfolio/docs/REPOSITORY_MAP_RU.md`
- `portfolio/docs/WORKFLOW_RU.md`
- `portfolio/docs/PUBLICATION_CHECKLIST_RU.md`
