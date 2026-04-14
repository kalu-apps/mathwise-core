import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/client";
import {
  mapIdentityIntentStatusMessage,
  normalizeIdentityIntentCode,
} from "@/pages/courses/model/identityIntentBridge";
import { mapBookingHoldResolutionMessage } from "@/pages/booking/model/bookingHoldBridge";
import {
  buildBookingFlowSteps,
  isBookingV2UnavailableError,
} from "@/pages/booking/model/bookingFlowController";
import {
  resolveCheckoutPaymentUrl,
  resolvePendingAttachCheckoutId,
  shouldOpenLoginAttachAction,
} from "@/pages/courses/model/coursePurchaseFlowController";

describe("identity intent bridge helpers", () => {
  it("maps all known intent states to product messages", () => {
    expect(mapIdentityIntentStatusMessage("verified")).toContain("подтвержден");
    expect(mapIdentityIntentStatusMessage("pending")).toContain("Введите код");
    expect(mapIdentityIntentStatusMessage("expired")).toContain("истекла");
    expect(mapIdentityIntentStatusMessage("consumed")).toContain("использована");
    expect(mapIdentityIntentStatusMessage("conflict")).toContain("конфликте");
  });

  it("normalizes verification code input", () => {
    expect(normalizeIdentityIntentCode("12ab34-56")).toBe("123456");
    expect(normalizeIdentityIntentCode("123456789")).toBe("123456");
  });
});

describe("booking hold bridge helpers", () => {
  it("maps hold expired and released states for UI", () => {
    expect(mapBookingHoldResolutionMessage("slot_hold_expired")).toContain("истекло");
    expect(mapBookingHoldResolutionMessage("slot_hold_inactive")).toContain(
      "истекло"
    );
    expect(mapBookingHoldResolutionMessage("hold_expired")).toContain("истекло");
    expect(mapBookingHoldResolutionMessage("hold_released")).toContain("истекло");
  });

  it("maps hold consumed states for UI", () => {
    expect(mapBookingHoldResolutionMessage("slot_hold_consumed")).toContain(
      "использован"
    );
    expect(mapBookingHoldResolutionMessage("hold_consumed")).toContain(
      "использован"
    );
  });

  it("maps login required states for UI", () => {
    expect(
      mapBookingHoldResolutionMessage("login_required_existing_account")
    ).toContain("Авторизуйтесь");
    expect(
      mapBookingHoldResolutionMessage("identity_conflict_auth_required")
    ).toContain("Авторизуйтесь");
  });

  it("returns null for unknown hold state", () => {
    expect(mapBookingHoldResolutionMessage("unexpected_state")).toBeNull();
  });

  it("derives booking flow onboarding step states", () => {
    const initial = buildBookingFlowSteps({
      bookingOpen: false,
      selectedSlotId: null,
      guestCheckoutOpen: false,
      pendingAuthOpen: false,
      pendingAuthRebookSlotId: null,
      pendingAuthHoldId: null,
      bookingSaving: false,
      userPresent: false,
    });
    expect(initial[0].state).toBe("pending");
    expect(initial[1].state).toBe("pending");

    const active = buildBookingFlowSteps({
      bookingOpen: true,
      selectedSlotId: "slot_1",
      guestCheckoutOpen: false,
      pendingAuthOpen: true,
      pendingAuthRebookSlotId: null,
      pendingAuthHoldId: "hold_1",
      bookingSaving: true,
      userPresent: true,
    });
    expect(active[0].state).toBe("done");
    expect(active[1].state).toBe("current");
    expect(active[2].state).toBe("current");
  });

  it("detects booking-v2 unavailable API responses", () => {
    expect(
      isBookingV2UnavailableError(
        new ApiError("disabled", 409, { code: "booking_v2_disabled" })
      )
    ).toBe(true);
    expect(isBookingV2UnavailableError(new ApiError("missing", 404))).toBe(true);
    expect(isBookingV2UnavailableError(new ApiError("other", 409))).toBe(false);
  });
});

describe("course checkout flow controller helpers", () => {
  it("resolves checkout payment urls by provider priority", () => {
    expect(
      resolveCheckoutPaymentUrl({
        redirectUrl: "https://pay.example/redirect",
      } as never)
    ).toBe("https://pay.example/redirect");
    expect(
      resolveCheckoutPaymentUrl({
        paymentUrl: "https://pay.example/direct",
      } as never)
    ).toBe("https://pay.example/direct");
    expect(
      resolveCheckoutPaymentUrl({
        sbp: { deepLinkUrl: "https://sbp.example/deep-link" },
      } as never)
    ).toBe("https://sbp.example/deep-link");
  });

  it("maps attach-required errors for login branching", () => {
    const authRequired = new ApiError("attach", 409, {
      code: "identity_conflict_auth_required",
      checkoutId: "checkout_1",
    });
    expect(shouldOpenLoginAttachAction(authRequired)).toBe(true);
    expect(resolvePendingAttachCheckoutId(authRequired)).toBe("checkout_1");
    expect(
      shouldOpenLoginAttachAction(
        new ApiError("other", 409, { code: "slot_conflict" })
      )
    ).toBe(false);
  });
});
