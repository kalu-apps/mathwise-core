import { describe, expect, it } from "vitest";
import {
  mapIdentityIntentStatusMessage,
  normalizeIdentityIntentCode,
} from "@/pages/courses/model/identityIntentBridge";
import { mapBookingHoldResolutionMessage } from "@/pages/booking/model/bookingHoldBridge";

describe("identity intent bridge helpers", () => {
  it("maps known intent states to product messages", () => {
    expect(mapIdentityIntentStatusMessage("verified")).toContain("подтвержден");
    expect(mapIdentityIntentStatusMessage("pending")).toContain("Введите код");
    expect(mapIdentityIntentStatusMessage("expired")).toContain("истекла");
  });

  it("normalizes verification code input", () => {
    expect(normalizeIdentityIntentCode("12ab34-56")).toBe("123456");
    expect(normalizeIdentityIntentCode("123456789")).toBe("123456");
  });
});

describe("booking hold bridge helpers", () => {
  it("maps hold resolution states for UI", () => {
    expect(mapBookingHoldResolutionMessage("slot_hold_expired")).toContain(
      "истекло"
    );
    expect(mapBookingHoldResolutionMessage("slot_hold_consumed")).toContain(
      "использован"
    );
    expect(
      mapBookingHoldResolutionMessage("login_required_existing_account")
    ).toContain("Авторизуйтесь");
  });
});
