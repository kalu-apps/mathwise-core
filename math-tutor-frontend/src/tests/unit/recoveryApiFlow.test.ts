import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();

vi.mock("@/shared/api/client", () => ({
  api: {
    post: postMock,
    get: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
  isRecoverableApiError: () => false,
}));

describe("auth recovery api flow", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("uses backend-owned request recovery endpoint", async () => {
    postMock.mockResolvedValueOnce({
      ok: true,
      message: "Код восстановления отправлен.",
      debugCode: null,
    });
    const mod = await import("@/features/auth/model/api");
    await mod.requestPasswordReset("student@example.com");
    expect(postMock).toHaveBeenCalledWith(
      "/auth/recovery/request",
      { email: "student@example.com" },
      { notifyDataUpdate: false }
    );
  });

  it("verifies recovery code before password reset", async () => {
    postMock
      .mockResolvedValueOnce({
        ok: true,
        message: "Код подтвержден.",
        recoveryToken: "recovery_token",
      })
      .mockResolvedValueOnce({
        ok: true,
        message: "Пароль обновлен.",
      });
    const mod = await import("@/features/auth/model/api");
    await mod.confirmPasswordReset({
      email: "student@example.com",
      token: "123456",
      newPassword: "StrongPassword!1",
    });
    expect(postMock).toHaveBeenNthCalledWith(
      1,
      "/auth/recovery/verify",
      { email: "student@example.com", code: "123456" },
      { notifyDataUpdate: false }
    );
    expect(postMock).toHaveBeenNthCalledWith(
      2,
      "/auth/password/reset",
      {
        email: "student@example.com",
        recoveryToken: "recovery_token",
        newPassword: "StrongPassword!1",
      },
      { notifyDataUpdate: false }
    );
  });
});
