# Workbook Phase 2 (Math Lesson Upgrade)

## Что сделано в коде
- Расширены права участника сессии (teacher/student) до granular-уровня:
  - `canDraw`, `canSelect`, `canDelete`, `canInsertImage`, `canClear`, `canExport`, `canUseLaser`
- Добавлены настройки сессии:
  - `undoPolicy`: `everyone | teacher_only | own_only`
  - `strictGeometry: boolean`
  - `studentControls`: точечные переключатели действий ученика
- Добавлен server endpoint:
  - `PUT /api/workbook/sessions/:id/settings`
  - `POST /api/workbook/pdf/render` (server-side PDF -> PNG pages)
- Добавлена поддержка событий:
  - `board.object.create/update/delete/pin`
  - `board.clear.request/confirm`
  - `focus.point`
  - `document.asset.add`
  - `document.state.update`
  - `document.annotation.add/clear`
  - `geometry.constraint.add/remove`
  - `settings.update`

## UI/UX в сессии
- Вертикальная панель инструментов:
  - select, pan, pen, highlighter, line, arrow, rectangle, ellipse, triangle, polygon, text, eraser, sweep, laser
- Контекстная панель:
  - слой, толщина, цвет, полигон `N`, текст/формула
  - меню доски (save/open/export/clear)
- Безопасная очистка слоя:
  - при коллективной сессии требуется подтверждение второго участника
- Отдельное окно документов:
  - загрузка PDF/изображений
  - PDF рендерится сервером в страницы-изображения для точных snapshot-объектов
  - переключение файла
  - zoom/page
  - быстрые пометки
  - «снимок на доску»
- Teacher-control блок:
  - переключатели ограничений ученика
  - сохранение policy в сессию
- Math Lab блок:
  - измерение длины и угла
  - constraints: parallel/perpendicular/equal_length
  - визуальный слой constraints прямо на доске (линии-связи между объектами)
  - интерактивный editor ограничений (выбор/пауза/удаление)
  - координатная сетка как объект
  - 3D объекты: solid/section/net

## Хранение и устойчивость
- Снимки по-прежнему сохраняются раздельно:
  - `board` snapshot (strokes + objects + chat + document)
  - `annotations` snapshot
- Лента событий продолжает быть source-of-truth для realtime-синхронизации.

## Что подключается на проде отдельно
- Реальный media stack:
  - WebRTC signaling + TURN/STUN + SFU
- Production document pipeline:
  - системный PDF renderer должен быть установлен на сервере (в mock используется poppler/pdftoppm)
- Надежная CRDT/OT политика на конкурирующие операции объектов (для групповых сессий 2+)

## Ограничения текущего mock-этапа
- Медиа-кнопки пока mock-only (UI контракт готов).
- Аннотации документа реализованы облегченно.
- Undo policy добавлен как доменный контракт; расширенная история/CRDT — следующий этап.
