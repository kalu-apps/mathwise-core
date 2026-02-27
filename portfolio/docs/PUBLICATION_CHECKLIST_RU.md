# Чеклист перед публикацией showcase

1. Удалены/замаскированы реальные email/персональные данные.
2. Нет секретов/ключей/токенов.
3. Проверены README и скриншоты.
4. Демо запускается командой из README.
5. `npm run lint` и `npm run build` проходят.
6. Добавлены ограничения/допущения в README.
7. Добавлены ссылки на основной стек и архитектурные решения.
8. В `CHANGELOG.md` showcase добавлен новый релизный блок:
   - `Добавлено`
   - `Исправлено`
9. Зафиксирован release-срез:
   - `portfolio/releases/showcase-release-history.json`
   - `portfolio/releases/archive/<версия>.json`
10. В changelog нет черновых/нестабильных задач — только то, что реально попало в showcase.
11. В showcase лежат:
    - `LICENSE`
    - `SHOWCASE_NOTICE.md`
12. Из public showcase убраны внутренние артефакты, не нужные для демо:
    - `.github`
    - `.vscode`
    - `docs/`
    - `reports/`
