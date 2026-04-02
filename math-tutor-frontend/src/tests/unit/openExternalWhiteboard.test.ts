import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/gateway/httpGateway", () => ({
  resolveHttpApiBase: () => "https://stage.mathwise.ru/api",
}));

describe("openExternalWhiteboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns popup_blocked code only when window.open is blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            artifactId: "artifact_1",
            launchUrl: "https://stage.board.mathwise.ru/workbook/launch/a",
            expiresAt: "2026-04-03T12:00:00.000Z",
          }),
      })
    );
    vi.stubGlobal(
      "window",
      {
        open: vi.fn().mockReturnValue(null),
      } as unknown as Window & typeof globalThis
    );

    const { openExternalWhiteboard } = await import("@/shared/lib/openExternalWhiteboard");
    const launch = await openExternalWhiteboard({ from: "/student/profile?tab=study" });

    expect(launch.ok).toBe(true);
    expect(launch.opened).toBe(false);
    expect(launch.code).toBe("popup_blocked");
  });
});
