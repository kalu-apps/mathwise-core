import { describe, expect, it } from "vitest";
import { validateRecoveryResetFields } from "@/features/auth/model/recoveryValidation";

const messages = {
  tokenRequired: "Введите код восстановления.",
  tokenInvalidFormat: "Код должен состоять из 6 цифр.",
  passwordRequired: "Введите новый пароль.",
  passwordTooShort: "Пароль должен содержать минимум 10 символов.",
};

describe("recovery reset validation", () => {
  it("returns inline field errors for empty token and password", () => {
    expect(validateRecoveryResetFields("", "", messages)).toEqual({
      tokenError: messages.tokenRequired,
      passwordError: messages.passwordRequired,
    });
  });

  it("validates token format and password minimum length", () => {
    expect(validateRecoveryResetFields("12ab", "short", messages)).toEqual({
      tokenError: messages.tokenInvalidFormat,
      passwordError: messages.passwordTooShort,
    });
  });

  it("passes valid payload", () => {
    expect(validateRecoveryResetFields("123456", "StrongPass1!", messages)).toEqual({
      tokenError: null,
      passwordError: null,
    });
  });
});
