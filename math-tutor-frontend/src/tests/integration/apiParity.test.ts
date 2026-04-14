import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readFile = (absolutePath: string) =>
  fs.readFileSync(absolutePath, "utf-8");

const collectSourceFiles = (root: string): string[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "tests") continue;
        walk(absolutePath);
        continue;
      }
      if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  };
  walk(root);
  return files;
};

describe("api parity", () => {
  it("does not keep legacy /users, /teacher-profiles, /support endpoints in active frontend runtime APIs", () => {
    const files = collectSourceFiles(path.resolve(process.cwd(), "src"));
    const forbidden = ["/users/", "/teacher-profiles/", "/support/"];

    for (const file of files) {
      const source = readFile(file);
      for (const endpoint of forbidden) {
        expect(source.includes(endpoint)).toBe(false);
      }
    }
  });

  it("keeps critical auth/booking/purchase/invite contract statuses in shared contracts", () => {
    const authContracts = readFile(
      path.resolve(process.cwd(), "src/shared/contracts/auth.contract.ts")
    );
    const bookingContracts = readFile(
      path.resolve(process.cwd(), "src/shared/contracts/booking.contract.ts")
    );
    const purchaseContracts = readFile(
      path.resolve(process.cwd(), "src/shared/contracts/purchase.contract.ts")
    );
    const profileContracts = readFile(
      path.resolve(process.cwd(), "src/shared/contracts/profile.contract.ts")
    );

    const requiredAuthStates = [
      "pending",
      "verified",
      "expired",
      "consumed",
      "conflict",
      "pending_first_password",
      "completed",
    ];
    for (const state of requiredAuthStates) {
      expect(authContracts.includes(`\"${state}\"`)).toBe(true);
    }

    const requiredBookingLiterals = [
      "active",
      "expired",
      "released",
      "consumed",
      "login_required_existing_account",
      "complete_registration",
      "hold_expired",
      "hold_released",
      "hold_consumed",
    ];
    for (const literal of requiredBookingLiterals) {
      expect(bookingContracts.includes(`\"${literal}\"`)).toBe(true);
    }

    const requiredPurchaseLiterals = [
      "email_correction_required",
      "identityCompleted",
      "firstPasswordRequired",
    ];
    for (const literal of requiredPurchaseLiterals) {
      expect(purchaseContracts.includes(literal)).toBe(true);
    }

    const requiredInviteStatuses = [
      "active",
      "expired",
      "consumed",
      "revoked",
      "invalid",
    ];
    for (const status of requiredInviteStatuses) {
      expect(profileContracts.includes(`\"${status}\"`)).toBe(true);
    }
  });
});
