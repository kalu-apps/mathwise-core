import { Readable } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

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

type Middleware = (
  req: { url?: string; method?: string; headers: Record<string, string> } & AsyncIterable<Buffer>,
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (chunk?: string) => void;
  },
  next: () => void
) => void | Promise<void>;

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  rawBody: string;
  jsonBody: unknown;
};

const createMockResponse = (): {
  response: MockResponse;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
  statusCode: number;
} => {
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    rawBody: "",
    jsonBody: null,
  };

  return {
    response,
    statusCode: 200,
    setHeader(name, value) {
      response.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      const body = chunk ?? "";
      response.statusCode = this.statusCode;
      response.rawBody = body;
      if (!body) {
        response.jsonBody = null;
        return;
      }
      try {
        response.jsonBody = JSON.parse(body);
      } catch {
        response.jsonBody = body;
      }
    },
  };
};

const createRequest = (params: {
  path: string;
  method: string;
  body?: unknown;
  cookie?: string;
}) => {
  const body = params.body ? JSON.stringify(params.body) : "";
  const chunks = body ? [Buffer.from(body)] : [];
  const stream = Readable.from(chunks) as Readable & {
    url?: string;
    method?: string;
    headers: Record<string, string>;
  };

  stream.url = params.path;
  stream.method = params.method;
  stream.headers = {
    ...(body ? { "content-type": "application/json" } : {}),
    ...(params.cookie ? { cookie: params.cookie } : {}),
  };

  return stream;
};

describe("logout/session integration", () => {
  it("returns null session after logout and does not restore old session", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-auth-test-"));
    const dbFile = path.join(tmpDir, "mock-db.json");

    try {
      process.env.APP_ENV = "local";
      process.env.ENABLE_MOCK_API_DEV = "true";
      process.env.ENABLE_MOCK_API_PREVIEW = "false";
      process.env.MOCK_ALLOW_DEV_RESET = "true";
      process.env.MOCK_ALLOW_TEACHER_SHORTCUTS = "true";
      process.env.AUTH_DEBUG_TOKENS = "true";
      process.env.CARD_WEBHOOK_SECRET = "test-card-secret";
      process.env.MOCK_DB_FILE = dbFile;

      vi.resetModules();
      const { setupMockServer } = await import("../../mock/server");

      const middlewares: Middleware[] = [];
      setupMockServer({
        middlewares: {
          use(handler: Middleware) {
            middlewares.push(handler);
          },
        },
      } as never);

      const handler = middlewares[0];
      expect(handler).toBeTypeOf("function");

      const callApi = async (params: {
        path: string;
        method: string;
        body?: unknown;
        cookie?: string;
      }) => {
        const req = createRequest(params);
        const res = createMockResponse();
        await handler(req as never, res as never, () => undefined);
        return res.response;
      };

      const email = "kalygina73@mail.ru";

      const requestCode = await callApi({
        path: "/api/auth/magic-link",
        method: "POST",
        body: { email },
      });
      expect(requestCode.statusCode).toBe(200);
      const codePayload = requestCode.jsonBody as { ok: boolean; debugCode?: string | null };
      expect(codePayload.ok).toBe(true);
      expect(typeof codePayload.debugCode).toBe("string");

      const confirm = await callApi({
        path: "/api/auth/magic-link/confirm",
        method: "POST",
        body: {
          email,
          code: codePayload.debugCode,
        },
      });
      expect(confirm.statusCode).toBe(200);

      const setCookieHeader = confirm.headers["set-cookie"];
      expect(setCookieHeader).toContain("mt_auth_session=");
      const sessionCookie = (setCookieHeader ?? "").split(";")[0] ?? "";
      expect(sessionCookie).toContain("mt_auth_session=");

      const sessionBeforeLogout = await callApi({
        path: "/api/auth/session",
        method: "GET",
        cookie: sessionCookie,
      });
      expect(sessionBeforeLogout.statusCode).toBe(200);
      expect(sessionBeforeLogout.jsonBody).not.toBeNull();

      const logout = await callApi({
        path: "/api/auth/logout",
        method: "POST",
        body: {},
        cookie: sessionCookie,
      });
      expect(logout.statusCode).toBe(200);

      const sessionAfterLogout = await callApi({
        path: "/api/auth/session",
        method: "GET",
        cookie: sessionCookie,
      });
      expect(sessionAfterLogout.statusCode).toBe(200);
      expect(sessionAfterLogout.jsonBody).toBeNull();
    } finally {
      restoreEnv();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
