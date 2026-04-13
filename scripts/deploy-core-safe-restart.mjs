#!/usr/bin/env node

import { execSync } from "node:child_process";

const readPositiveInt = (value, fallback, cap) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, cap);
};

const readBool = (value, fallback = false) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const withTimeout = async (task, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const runShell = (label, command, dryRun) => {
  if (!command) return;
  if (dryRun) {
    console.log(`[dry-run] ${label}: ${command}`);
    return;
  }
  execSync(command, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
};

const getStatus = async (baseUrl, path) => {
  const url = `${baseUrl}${path}`;
  try {
    const response = await withTimeout((signal) => fetch(url, { method: "GET", signal }), 8_000);
    return {
      url,
      status: response.status,
      ok: response.ok,
      error: null,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const checkReadiness = async (baseUrl, healthPath, readyPath) => {
  const [health, ready] = await Promise.all([
    getStatus(baseUrl, healthPath),
    getStatus(baseUrl, readyPath),
  ]);
  return {
    ready: health.status === 200 && ready.status === 200,
    health,
    readyEndpoint: ready,
  };
};

const run = async () => {
  const dryRun = readBool(process.env.DEPLOY_DRY_RUN, false);
  const timeoutMs = readPositiveInt(process.env.DEPLOY_WAIT_TIMEOUT_MS, 240_000, 900_000);
  const pollIntervalMs = readPositiveInt(process.env.DEPLOY_POLL_INTERVAL_MS, 2_500, 60_000);

  const baseUrl = String(process.env.DEPLOY_API_BASE_URL ?? "http://127.0.0.1:3001")
    .trim()
    .replace(/\/+$/g, "");
  const healthPath = String(process.env.DEPLOY_HEALTH_PATH ?? "/health").trim();
  const readyPath = String(process.env.DEPLOY_READY_PATH ?? "/ready").trim();

  const restartApiCommand = String(
    process.env.DEPLOY_RESTART_API_CMD ?? "systemctl restart mathwise-core-staging-api.service"
  ).trim();
  const restartFrontendCommand = String(
    process.env.DEPLOY_RESTART_FRONTEND_CMD ?? "systemctl restart mathwise-core-staging-frontend.service"
  ).trim();
  const reloadNginxCommand = String(process.env.DEPLOY_RELOAD_NGINX_CMD ?? "systemctl reload nginx").trim();
  const skipNginxReload = readBool(process.env.DEPLOY_SKIP_NGINX_RELOAD, false);

  const postCheckCommand = String(
    process.env.DEPLOY_POST_CHECK_CMD ?? `API_BASE_URL=${baseUrl} ./scripts/release-verify.sh`
  ).trim();

  const startedAt = Date.now();
  try {
    runShell("restart-api", restartApiCommand, dryRun);
    runShell("restart-frontend", restartFrontendCommand, dryRun);
    if (!skipNginxReload) {
      runShell("reload-nginx", reloadNginxCommand, dryRun);
    }

    if (dryRun) {
      runShell("post-check", postCheckCommand, true);
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: true,
            baseUrl,
            timeoutMs,
            pollIntervalMs,
            readinessCheckSkipped: true,
          },
          null,
          2
        )
      );
      return;
    }

    let readiness = null;
    while (Date.now() - startedAt <= timeoutMs) {
      readiness = await checkReadiness(baseUrl, healthPath, readyPath);
      if (readiness.ready) break;
      await sleep(pollIntervalMs);
    }

    if (!readiness?.ready) {
      throw new Error("deploy_timeout_waiting_for_readiness");
    }

    runShell("post-check", postCheckCommand, false);

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          waitMs: Date.now() - startedAt,
          timeoutMs,
          pollIntervalMs,
          dryRun,
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: message,
          baseUrl,
          waitMs: Date.now() - startedAt,
          timeoutMs,
          pollIntervalMs,
          dryRun,
        },
        null,
        2
      )
    );
    process.exit(2);
  }
};

run();
