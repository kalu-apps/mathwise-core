import { describe, expect, it } from "vitest";
import { getCheckoutAccessUiState } from "@/domain/auth-payments/model/ui";

describe("checkout access contract mapping", () => {
  it("maps hardened checkout access states into UI states", () => {
    expect(getCheckoutAccessUiState("awaiting_profile")).toBe("awaiting_profile");
    expect(getCheckoutAccessUiState("awaiting_verification")).toBe(
      "awaiting_verification"
    );
    expect(getCheckoutAccessUiState("email_correction_required")).toBe(
      "awaiting_verification"
    );
    expect(getCheckoutAccessUiState("paid_but_restricted")).toBe(
      "paid_but_restricted"
    );
    expect(getCheckoutAccessUiState("active")).toBeNull();
  });
});
