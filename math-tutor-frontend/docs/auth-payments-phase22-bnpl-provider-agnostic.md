# Auth + Payments + Access Control (Phase 22 BNPL Provider-Agnostic Adapter)

## Что закрыто в этой фазе

Фаза закрывает переход BNPL с «плоской структуры» на provider-agnostic модель без слома текущих сценариев и без изменения доменной последовательности checkout -> payment confirmation -> entitlement.

Сделано:

1. Унифицирована модель BNPL в сущности покупки:
   - `offer` (маркетинговый quote),
   - `plan` (фактический график),
   - `provider` и `lastKnownStatus`.
2. Сохранена обратная совместимость с уже существующими данными (`installmentsCount`, `paidCount`, `schedule`, `nextPaymentDate`).
3. Добавлен mock adapter с режимами:
   - `fixed4`,
   - `choice4_6_10`,
   - `unknownUntilCheckout`.
4. Mock server теперь нормализует BNPL в новую модель и учитывает выбор плана рассрочки в checkout.
5. В checkout UI добавлен выбор плана BNPL (если доступно несколько вариантов), выбранный план передается в payload.

## Основные изменения по коду

### 1) Типы и модель данных

- `src/entities/purchase/model/types.ts`
  - Добавлены `BnplPlanPreview`, `BnplQuote`, `BnplPurchaseData`.
  - `Purchase.bnpl` переведен на новую provider-agnostic структуру.

### 2) Mock adapter

- `src/entities/purchase/model/bnplMockAdapter.ts`
  - Добавлены функции генерации BNPL-оффера и графика:
    - `getBnplMockOffer`,
    - `buildBnplMockPlan`,
    - `buildBnplMockPurchaseData`,
    - `resolveBnplMockMode`.

### 3) Нормализация в purchase storage

- `src/entities/purchase/model/storage.ts`
  - Нормализация `bnpl` переведена на `BnplPurchaseData`.
  - Добавлены fail-safe fallback и legacy-совместимость.
  - Расширен `CheckoutPayload` полем `bnplInstallmentsCount`.

### 4) Селекторы BNPL

- `src/entities/purchase/model/selectors.ts`
  - Селекторы теперь читают и новую (`bnpl.plan`), и legacy-структуру.
  - `selectBnplMarketingInfo` использует mock adapter и поддерживает `availablePlans`.

### 5) Mock server

- `src/mock/server.ts`
  - BNPL snapshot переведен на `BnplPurchaseData`.
  - Добавлена нормализация BNPL в новом формате в `/api/purchases`.
  - В checkout flow добавлен `bnplInstallmentsCount` и его перенос в purchase snapshot.
  - В `checkout status` добавлено поле `bnplInstallmentsCount`.

### 6) Checkout UI

- `src/pages/courses/CourseDetails.tsx`
  - Для BNPL добавлен выбор количества платежей при наличии нескольких планов.
  - Выбор передается в `checkoutPurchase` через `bnplInstallmentsCount`.

- `src/styles/visual/migrated/course-details.scss`
  - Добавлены стили для picker-а BNPL планов (`course-details__bnpl-plan-*`).
  - Добавлена адаптация под mobile и light theme.

### 7) API-контракт checkouts

- `src/domain/auth-payments/model/api.ts`
  - Добавлен `bnplInstallmentsCount` в `CheckoutStatusResponse` и `CheckoutListItem`.

- `src/domain/auth-payments/model/types.ts`
  - В `CheckoutProcess` добавлено поле `bnplInstallmentsCount`.

## Интеграция реального провайдера (точка замены)

Пока используется mock adapter. Для production провайдера достаточно заменить источник данных в `bnplMockAdapter` (или внедрить adapter interface рядом), не меняя UI-компоненты и селекторы.

UI уже готов к трем сценариям:

1. один фиксированный план,
2. несколько вариантов планов,
3. отсутствие точного графика до checkout.

## Проверки

Локально пройдены:

- `npm run lint`
- `npm run build`

Обе проверки зеленые после изменений фазы.
