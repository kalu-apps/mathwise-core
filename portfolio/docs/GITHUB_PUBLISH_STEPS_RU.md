# Публикация репозиториев в GitHub (kalu-apps)

## Предусловия
1. Есть PAT токен GitHub с правами `repo`.
2. Токен экспортирован в окружение.

## One-shot публикация
```bash
cd /Users/ivankalugin/Documents/New\ project
GITHUB_OWNER=kalu-apps GITHUB_TOKEN=<ваш_token> ./portfolio/scripts/publish-remotes.sh
```

Скрипт:
- создаёт 1 private + 3 public репозитория;
- настраивает `origin`;
- пушит `main` во все репозитории.

## Что делать после
1. Закрепить 3 showcase-репозитория в профиле GitHub.
2. Добавить live demo ссылки (Vercel/Netlify) в README каждого showcase.
3. Включить ежедневный ритм коммитов в private core.

## Еженедельный release-срез в showcase
1. Обновить `portfolio/releases/showcase-release.config.json`.
2. Запустить:
   ```bash
   node portfolio/scripts/release-showcases.mjs
   ```
3. Проверить lint/build в каждом showcase в `portfolio-repos/*`.
4. Запушить изменения только в public showcase репозитории.
5. `core` остаётся источником правды, showcase — витрина готового.
