import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), "src", relativePath), "utf-8");

const assertContainsAll = (source: string, values: string[]) => {
  for (const value of values) {
    assert.equal(
      source.includes(value),
      true,
      `Expected to find "${value}" in contract source`
    );
  }
};

test("contract semantics: auth identity-intent and completion states stay explicit", () => {
  const source = read("auth/auth.types.ts");
  assertContainsAll(source, [
    '"pending"',
    '"verified"',
    '"expired"',
    '"consumed"',
    '"conflict"',
    '"pending_identity_verification"',
    '"pending_account_finalization"',
    '"pending_first_password"',
    '"completed"',
  ]);
});

test("contract semantics: purchase gating and access states include hardened branches", () => {
  const typesSource = read("purchases/purchases.types.ts");
  const purchaseServiceSource = read("purchases/purchases.service.ts");
  const purchaseIdentityOrchestrationSource = read(
    "purchases/purchases.identity-orchestration.ts"
  );
  const intentServiceSource = read("auth/auth.identity-intent.service.ts");
  const purchaseGatingSource = [
    purchaseServiceSource,
    purchaseIdentityOrchestrationSource,
  ].join("\n");

  assertContainsAll(typesSource, [
    '"email_correction_required"',
    '"awaiting_verification"',
    '"paid_but_restricted"',
  ]);
  assertContainsAll(purchaseGatingSource, [
    "identity_intent_runtime_disabled",
    "identity_intent_runtime_unavailable",
    "identity_intent_required",
    "identity_intent_context_mismatch",
  ]);
  assertContainsAll(intentServiceSource, [
    "identity_intent_expired",
    "identity_intent_consumed",
    "identity_intent_conflict",
    "identity_intent_context_invalid",
    "identity_intent_invalid",
  ]);
});

test("contract semantics: booking holds and teacher invites keep canonical lifecycle statuses", () => {
  const bookingsSource = read("bookings/bookings.types.ts");
  const profileSource = read("profile/profile.types.ts");

  assertContainsAll(bookingsSource, [
    '"active"',
    '"consumed"',
    '"released"',
    '"expired"',
    '"login_required_existing_account"',
    '"complete_registration"',
    '"hold_expired"',
    '"hold_released"',
    '"hold_consumed"',
  ]);
  assertContainsAll(profileSource, [
    '"active"',
    '"expired"',
    '"consumed"',
    '"revoked"',
    '"invalid"',
  ]);
});
