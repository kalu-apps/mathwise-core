# Assessments Phase 1 (Teacher Smart Tests)

## Что реализовано

1. Добавлен новый feature-модуль `assessments`:
- модели шаблонов тестов (TestTemplate),
- очередь контента курса (уроки + тесты),
- попытки прохождения и прогресс,
- движок проверки ответов (`number` / `text` / `expression` baseline).

2. Добавлены teacher-страницы:
- `/teacher/tests` — список шаблонов тестов (поиск, фильтр, preview, duplicate, delete),
- `/teacher/tests/:templateId` — редактор теста (создание/редактирование, draft/publish, live preview проверки ответа).

3. Интеграция в редактор курса:
- кнопка `Добавить тест` рядом с `Добавить урок`,
- выбор из шаблонов в модальном окне,
- единая очередь контента курса (уроки + тесты) с reorder,
- сохранение очереди вместе с курсом.

4. Student flow:
- в содержании курса тесты отображаются отдельными карточками,
- тесты не блокируют прогресс по урокам,
- добавлен отдельный тест-плеер `/courses/:courseId/tests/:testItemId`,
- retake обновляет latest-progress.

5. Прогресс тестов:
- в шапке курса и в карточках студента отображаются метрики по тестам,
- у учителя в профиле студента отображается тестовый прогресс по каждому купленному курсу.

6. Lesson settings + best-effort media deterrents:
- добавлен флаг урока `disablePrintableDownloads`,
- при включении в уроке скрывается скачивание печатных материалов,
- видео-плеер получил best-effort deterrents: watermark overlay, запрет контекстного меню и предупреждение на screenshot-shortcuts.

## Ограничения

1. Anti-screenshot/recording не является абсолютной защитой (ограничение браузеров), реализован только deterrent UX.
2. Проверка `expression` работает как нормализованный текстовый матч без CAS.
3. Пока используется front-end-first storage (localStorage/mock) без отдельного backend модуля assessments.

## Дальше (следующий шаг)

1. Добавить server-side endpoints mock (`/api/assessments/*`) и перевести storage-операции с localStorage на API-слой в assessments.
2. Добавить teacher summary-блок в общем dashboard (агрегированный тестовый прогресс по студентам, без входа в карточку студента).
3. Добавить легковесные тесты (unit) для evaluator и селекторов прогресса.
