# Ежедневный workflow

## В core-репозитории
1. Создавать ветку `feature/<краткая-задача>`.
2. Делать логические коммиты.
3. Прогонять минимум: `npm run lint && npm run build`.
4. Сливать в `main`.

## Частота коммитов
- Минимум 1 рабочий коммит в день.
- Избегать больших "свалок" изменений.

## Release-срез в showcase
- Периодичность: 1 раз в неделю (или по крупной стабильной фиче).
- Источник правды: private `core`.
- Showcase: только витрина готовых и стабильных изменений.

### Порядок
1. Заполнить `portfolio/releases/showcase-release.config.json` (разделы `added` / `fixed`).
2. Запустить release-срез:
   ```bash
   node portfolio/scripts/release-showcases.mjs
   ```
3. Скрипт:
   - пересобирает `portfolio-repos/*` из `core`;
   - обновляет `CHANGELOG.md` в каждом showcase;
   - пишет историю релизов в `portfolio/releases/showcase-release-history.json`;
   - архивирует конфиг релиза в `portfolio/releases/archive/`.
4. Проверить каждый showcase:
   ```bash
   cd portfolio-repos/math-whiteboard-demo && npm run lint && npm run build
   cd ../math-realtime-lesson-demo && npm run lint && npm run build
   cd ../math-axiom-assistant-demo && npm run lint && npm run build
   ```
5. Закоммитить и запушить только стабильный срез в public showcase-репозитории.

## Шаблон сообщений коммитов
- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `docs: ...`
- `chore: ...`
