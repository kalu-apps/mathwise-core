# Workbook Phase 1 (Teacher-led sessions + personal notebooks)

## Что реализовано

1. Добавлен новый доменный контур `Workbook`:
   - `Session` (`PERSONAL` / `CLASS`, `draft` / `in_progress` / `ended`);
   - `Participants` с правами;
   - `Draft`-карточки в кабинете;
   - `Invite link` для CLASS-сессий;
   - `Events` + `Snapshots` для восстановления состояния.

2. Добавлены API mock-endpoints:
   - `GET /api/workbook/drafts`
   - `POST /api/workbook/sessions`
   - `GET /api/workbook/sessions/:id`
   - `POST /api/workbook/sessions/:id/open`
   - `POST /api/workbook/sessions/:id/end`
   - `POST /api/workbook/sessions/:id/duplicate`
   - `POST /api/workbook/sessions/:id/invite`
   - `GET /api/workbook/invites/:token`
   - `POST /api/workbook/invites/:token/join`
   - `GET/POST /api/workbook/sessions/:id/events`
   - `GET/PUT /api/workbook/sessions/:id/snapshot`
   - `POST /api/workbook/sessions/:id/presence`

3. Ролевые ограничения:
   - CLASS session может создать только `teacher`.
   - Invite link может создать только участник с teacher-permissions.
   - Доступ к сессии, событиям, снапшотам — только участникам сессии.

4. UI:
   - Хаб `/workbook`:
     - фильтры «Личные тетради / Коллективные уроки»;
     - CTA по роли;
     - карточки сессий;
     - действие «Создать новую на основе».
   - Сессионная страница `/workbook/session/:sessionId`:
     - интерактивная доска с двумя слоями (`board` + `annotations`);
     - синхронизация через event-polling;
     - heartbeat-presence;
     - чат сессии;
     - mock media controls (mic/cam/screen UX-контракт).
   - Join invite route `/workbook/invite/:token`.

5. Интеграция в кабинет:
   - кнопка «Рабочая тетрадь» в `StudyCabinetPanel` теперь активна;
   - переход из student/teacher профилей в `/workbook`.

## Что оставлено на следующую фазу

1. Реальный WebRTC signaling и SFU-интеграция (LiveKit/mediasoup/Janus-класс).
2. Реальный WebSocket transport вместо polling.
3. Device picker, network diagnostics, call quality telemetry.
4. Overlay-аннотации поверх реального screen-share media track.

## Почему так

Такой порядок дает максимальную рентабельность:

1. Сначала фиксируется доменная модель и UX-сценарий без vendor lock-in.
2. Дальше media/realtime слой подключается заменой adapter’ов, без переписывания UI и БД.

