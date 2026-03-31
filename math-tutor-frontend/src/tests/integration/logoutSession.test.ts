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

describe("logout/session integration", () => {
  it("returns null session after logout and does not restore old session", async () => {
    process.env.APP_ENV = "local";
    process.env.GATEWAY_MODE = "http";
    process.env.API_BASE_URL = "http://127.0.0.1:3001/api";

    let sessionActive = true;
    const sessionUser = {
      id: "user-student-1",
      email: "student@example.com",
      firstName: "Student",
      lastName: "One",
      role: "student",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/auth/session") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify(sessionActive ? sessionUser : null), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/api/auth/logout") && init?.method === "POST") {
        sessionActive = false;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { getAuthSession, logoutAuthSession } = await import(
      "../../features/auth/model/api"
    );

    const beforeLogout = await getAuthSession();
    expect(beforeLogout).toEqual(sessionUser);

    await logoutAuthSession();

    const afterLogout = await getAuthSession();
    expect(afterLogout).toBeNull();
  });
});
