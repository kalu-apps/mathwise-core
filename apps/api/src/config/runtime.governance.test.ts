import assert from "node:assert/strict";
import test from "node:test";
import {
  isStagePaymentConfirmRuntimeEnabled,
  isStageSiteGateRuntimeEnabled,
  shouldRequireBookingV2HoldForGuest,
} from "./runtime.governance";

test("runtime governance: stage site gate requires stage env and enabled flag", () => {
  assert.equal(
    isStageSiteGateRuntimeEnabled({
      appEnv: "stage",
      stageSiteGateEnabled: true,
      stagePaymentConfirmEnabled: false,
    }),
    true
  );
  assert.equal(
    isStageSiteGateRuntimeEnabled({
      appEnv: "prod",
      stageSiteGateEnabled: true,
      stagePaymentConfirmEnabled: false,
    }),
    false
  );
  assert.equal(
    isStageSiteGateRuntimeEnabled({
      appEnv: "stage",
      stageSiteGateEnabled: false,
      stagePaymentConfirmEnabled: false,
    }),
    false
  );
});

test("runtime governance: stage payment confirm requires stage env and enabled flag", () => {
  assert.equal(
    isStagePaymentConfirmRuntimeEnabled({
      appEnv: "stage",
      stageSiteGateEnabled: false,
      stagePaymentConfirmEnabled: true,
    }),
    true
  );
  assert.equal(
    isStagePaymentConfirmRuntimeEnabled({
      appEnv: "local",
      stageSiteGateEnabled: false,
      stagePaymentConfirmEnabled: true,
    }),
    false
  );
  assert.equal(
    isStagePaymentConfirmRuntimeEnabled({
      appEnv: "stage",
      stageSiteGateEnabled: false,
      stagePaymentConfirmEnabled: false,
    }),
    false
  );
});

test("runtime governance: booking guest compat gate is controlled by booking v2 flags", () => {
  assert.equal(
    shouldRequireBookingV2HoldForGuest(
      {
        bookingV2Enabled: true,
        bookingV2GuestCompatibilityEnabled: false,
      },
      false
    ),
    true
  );
  assert.equal(
    shouldRequireBookingV2HoldForGuest(
      {
        bookingV2Enabled: true,
        bookingV2GuestCompatibilityEnabled: true,
      },
      false
    ),
    false
  );
  assert.equal(
    shouldRequireBookingV2HoldForGuest(
      {
        bookingV2Enabled: false,
        bookingV2GuestCompatibilityEnabled: false,
      },
      false
    ),
    false
  );
  assert.equal(
    shouldRequireBookingV2HoldForGuest(
      {
        bookingV2Enabled: true,
        bookingV2GuestCompatibilityEnabled: false,
      },
      true
    ),
    false
  );
});
