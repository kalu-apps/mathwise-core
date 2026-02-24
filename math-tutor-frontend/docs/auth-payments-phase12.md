# Auth + Payments + Access Control (Phase 12 Payment Provider Boundary)

## Scope of Phase 12

Phase 12 introduces an explicit payment-adapter boundary so payment methods can evolve without rewriting checkout/access domain logic.

The phase is implementation-agnostic and preserves current UX behavior.

## 1) New domain payment gateway layer

Added:

- `src/domain/auth-payments/model/paymentGateway.ts`

This module defines:

- `PaymentInitiationInput`
- `PaymentInitiationDecision`
- `PaymentMethodAdapter`
- `initiateCheckoutPayment(...)`

Supported adapters in mock mode:

- `mock`
- `card`
- `sbp`
- `bnpl`

All are mapped to the same trusted event contract:

- provider id
- external event id
- normalized status
- provider payload

## 2) Checkout orchestration migrated to gateway

`POST /api/purchases/checkout` in `mock/server.ts` now:

1. builds/reuses checkout process,
2. calls `initiateCheckoutPayment(...)`,
3. applies resulting trusted payment event through existing idempotent processor (`processPaymentEvent`),
4. runs provisioning (`ensureCheckoutProvisioned`) unchanged.

This keeps state-machine behavior intact while decoupling provider-specific initiation logic.

## 3) Why this matters

- New payment methods can be added as adapters, not endpoint rewrites.
- Provider-specific metadata stays outside core checkout/access transitions.
- Existing reconciliation, dedupe, entitlement activation, and support tooling remain unchanged.

## 4) Compatibility

- No changes in UI flow requirements.
- No changes in access rules.
- No changes in entitlement lifecycle semantics.

## 5) Validation

- `npm run lint` passed.
- `npm run build` passed.

