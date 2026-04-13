import { afterEach, describe, expect, it, vi } from "vitest";

const SNAPSHOT_ENV = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAPSHOT_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(SNAPSHOT_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("api client base url", () => {
  it("uses /api by default", async () => {
    delete process.env.API_BASE_URL;

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("@/shared/api/client");
    await api.get("/stage-access/status", { dedupe: false, cacheTtlMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/stage-access/status");
  });

  it("uses API_BASE_URL and appends /api when missing", async () => {
    process.env.API_BASE_URL = "https://api.stage.mathwise.ru";

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("@/shared/api/client");
    await api.get("/stage-access/status", { dedupe: false, cacheTtlMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.stage.mathwise.ru/api/stage-access/status"
    );
  });
});
