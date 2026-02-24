# Auth + Payments + Access Control (Phase 23 Payment Attempts + Checkout Hardening)

## Что реализовано

1. Добавлен слой `PaymentAttempt` для представления попыток оплаты в UI (история и latest-state).
2. Добавлен mock payment adapter (provider-agnostic интерфейс) поверх текущих checkout API.
3. Checkout/status payload расширен для redirect/SBP-данных.
4. В mock server добавлена имитация асинхронного подтверждения card/sbp + ручное подтверждение `Я оплатил`.
5. В `StudentPurchaseDetails` добавлена история попыток оплаты с действиями retry/cancel/confirm.
6. У учителя на карточках студентов убран статус BNPL-оплаты (по запросу).

## Измененные файлы

- `src/domain/auth-payments/model/paymentGateway.ts`
- `src/domain/auth-payments/model/api.ts`
- `src/entities/purchase/model/paymentAttempts.ts`
- `src/entities/purchase/model/mockPaymentAdapter.ts`
- `src/entities/purchase/model/storage.ts`
- `src/pages/courses/CourseDetails.tsx`
- `src/pages/profile/StudentPurchaseDetails.tsx`
- `src/pages/teacher/TeacherDashboard.tsx`
- `src/entities/student/ui/StudentCard.tsx`
- `src/styles/visual/migrated/purchase-details.scss`
- `src/mock/server.ts`

## Валидация

- `npm run lint` — passed
- `npm run build` — passed
