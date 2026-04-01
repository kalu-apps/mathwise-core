import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";

const applyStageEnv = () => {
  process.env.APP_ENV = "stage";
  process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
  process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.CARD_WEBHOOK_SECRET = "test-secret";
  process.env.AUTH_PASSWORD_PEPPER = "pepper";
  process.env.AUTH_COOKIE_SECURE = "true";
  process.env.AUTH_DEBUG_TOKENS = "false";
  process.env.WORKBOOK_LAUNCH_ENABLED = "false";
  process.env.STAGE_SITE_GATE_ENABLED = "true";
  process.env.STAGE_SITE_GATE_SECRET = "stage-site-access-secret";
  process.env.STAGE_SITE_GATE_COOKIE_NAME = "mt_stage_access";
  process.env.STAGE_SITE_GATE_TTL_SEC = "1800";
};

const restoreEnv = (snapshot: NodeJS.ProcessEnv) => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

test("stage access: verify issues dedicated gate cookie, not auth cookie", async () => {
  const snapshot = { ...process.env };
  try {
    applyStageEnv();
    const { StageAccessService } = await import("./stage-access.service");
    const service = new StageAccessService();

    const issued = service.verify("stage-site-access-secret");
    assert.equal(issued.response.ok, true);
    assert.equal(issued.response.enabled, true);
    assert.equal(issued.response.granted, true);
    assert.match(issued.setCookie, /mt_stage_access=/);
    assert.equal(issued.setCookie.includes("mt_auth_session="), false);

    const status = service.getStatus(issued.setCookie);
    assert.equal(status.enabled, true);
    assert.equal(status.granted, true);
  } finally {
    restoreEnv(snapshot);
  }
});

test("stage access: invalid secret rejected", async () => {
  const snapshot = { ...process.env };
  try {
    applyStageEnv();
    const { StageAccessService } = await import("./stage-access.service");
    const service = new StageAccessService();

    assert.throws(
      () => service.verify("wrong-secret"),
      (error: unknown) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 401);
        return true;
      }
    );
  } finally {
    restoreEnv(snapshot);
  }
});
