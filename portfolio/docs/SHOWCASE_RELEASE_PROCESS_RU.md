# Release-срез showcase (core → витрина)

## Принцип
- `core` — единственный источник правды.
- Showcase-репозитории — витрина только готовых и стабильных изменений.

## Шаги
1. Создать release-ветку от `main`:
   ```bash
   ./portfolio/scripts/create-showcase-release-branch.sh <версия>
   ```

2. Заполнить `portfolio/releases/showcase-release.config.json`:
   - `version`
   - `releaseDate`
   - `notes.whiteboard/realtime/assistant.added`
   - `notes.whiteboard/realtime/assistant.fixed`

3. Выполнить release-срез:
   ```bash
   node portfolio/scripts/release-showcases.mjs
   ```

4. Что сделает скрипт:
   - обновит содержимое `portfolio-repos/*` из `core`;
   - сохранит/обновит `CHANGELOG.md` в каждом showcase;
   - зафиксирует релиз в `portfolio/releases/showcase-release-history.json`;
   - создаст архив релизного конфига в `portfolio/releases/archive/`.

5. Проверить стабильность showcase:
   ```bash
   cd portfolio-repos/math-whiteboard-demo && npm run lint && npm run build
   cd ../math-realtime-lesson-demo && npm run lint && npm run build
   cd ../math-axiom-assistant-demo && npm run lint && npm run build
   ```

6. Закоммитить release-ветку и влить её в `main`.

7. Запушить только в public showcase-репозитории.

## Полезные режимы
- Предпросмотр без записи:
  ```bash
  node portfolio/scripts/release-showcases.mjs --dry-run
  ```
- Пропустить экспорт (только changelog/history):
  ```bash
  node portfolio/scripts/release-showcases.mjs --skip-export
  ```
