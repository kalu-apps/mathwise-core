import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { chromium } from "playwright";

const root = process.cwd();
const host = process.env.RELIABILITY_GATE_HOST ?? "127.0.0.1";
const port = Number(process.env.RELIABILITY_GATE_PORT ?? 4173);
const baseUrl = process.env.RELIABILITY_GATE_BASE_URL ?? `http://${host}:${port}`;
const serverMode = process.env.RELIABILITY_GATE_SERVER ?? "dev";
const outputPath = path.join(root, "docs/reliability-slo-report.json");

const configPath = path.join(root, "docs/reliability-slo-gates.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : {};

const thresholds = {
  inpP75Max: Number(
    process.env.RELIABILITY_SLO_INP_P75_MAX ??
      config.inpP75Max ??
      500
  ),
  apiErrorRateMax: Number(
    process.env.RELIABILITY_SLO_API_ERROR_RATE_MAX ??
      config.apiErrorRateMax ??
      0.12
  ),
  duplicateSubmitRateMax: Number(
    process.env.RELIABILITY_SLO_DUPLICATE_RATE_MAX ??
      config.duplicateSubmitRateMax ??
      0.08
  ),
  minInpSamples: Number(
    process.env.RELIABILITY_SLO_MIN_INP_SAMPLES ??
      config.minInpSamples ??
      5
  ),
  minApiRequests: Number(
    process.env.RELIABILITY_SLO_MIN_API_REQUESTS ??
      config.minApiRequests ??
      10
  ),
};

const dbPath = path.join(root, "mock-db.json");
const db = fs.existsSync(dbPath)
  ? JSON.parse(fs.readFileSync(dbPath, "utf-8"))
  : { users: [] };
const users = Array.isArray(db?.users) ? db.users : [];
const student = users.find((user) => user?.role === "student") ?? null;

const scenarios = [
  {
    id: "desktop-dark",
    viewport: { width: 1440, height: 900 },
    theme: "dark",
  },
  {
    id: "mobile-dark",
    viewport: { width: 390, height: 844 },
    theme: "dark",
  },
];

const aggregate = {
  performance: {
    INP: [],
    LCP: [],
    CLS: [],
    LONG_TASK: [],
  },
  api: {
    success: 0,
    failure: 0,
    ignoredFailures: 0,
    failureByCode: {},
  },
  actionGuard: {
    started: 0,
    blocked: 0,
    succeeded: 0,
    failed: 0,
  },
  notes: [],
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const p75 = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * 0.75) - 1)
  );
  return sorted[index];
};

const waitForUrl = async (url, timeoutMs = 45_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status === 404) return true;
    } catch {
      // continue polling
    }
    await wait(350);
  }
  return false;
};

let serverProcess = null;
const startServer = async () => {
  if (serverMode === "external") {
    const ready = await waitForUrl(`${baseUrl}/`, 60_000);
    if (!ready) {
      throw new Error(`External server is not reachable at ${baseUrl}`);
    }
    return;
  }

  const runner = process.platform === "win32" ? "npm.cmd" : "npm";
  const args =
    serverMode === "preview"
      ? ["run", "preview", "--", "--host", host, "--port", String(port), "--strictPort"]
      : ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"];

  serverProcess = spawn(runner, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  const ready = await waitForUrl(`${baseUrl}/`, 60_000);
  if (!ready) {
    throw new Error(`Server is not reachable at ${baseUrl}`);
  }
};

const stopServer = () => {
  if (!serverProcess) return;
  serverProcess.kill("SIGTERM");
  serverProcess = null;
};

const installTelemetryBridge = async (context, theme) => {
  await context.addInitScript(
    ({ selectedTheme }) => {
      try {
        document.documentElement.setAttribute("data-theme", selectedTheme);
      } catch {
        // ignore
      }
      try {
        localStorage.setItem("math-tutor-theme-mode", selectedTheme);
      } catch {
        // ignore
      }
      const bag = {
        performance: [],
        api: { success: 0, failure: [], ignoredFailure: 0 },
        actionGuard: { started: 0, blocked: 0, succeeded: 0, failed: 0 },
      };

      const attach = () => {
        if (window.__qaReliabilityAttached) return;
        window.__qaReliabilityAttached = true;

        window.addEventListener("app-performance", (event) => {
          const detail = event?.detail;
          if (!detail) return;
          bag.performance.push(detail);
        });

        window.addEventListener("app-api-success", () => {
          bag.api.success += 1;
        });

        window.addEventListener("app-api-failure", (event) => {
          const detail = event?.detail;
          if (!detail) return;
          const isExpectedSession401 =
            detail?.code === "unauthorized" && detail?.path === "/auth/session";
          if (isExpectedSession401) {
            bag.api.ignoredFailure += 1;
            return;
          }
          bag.api.failure.push(detail);
        });

        window.addEventListener("app-action-guard", (event) => {
          const detail = event?.detail;
          if (!detail) return;
          if (detail.status === "started") bag.actionGuard.started += 1;
          if (detail.status === "blocked_local" || detail.status === "blocked_global") {
            bag.actionGuard.blocked += 1;
          }
          if (detail.status === "succeeded") bag.actionGuard.succeeded += 1;
          if (detail.status === "failed") bag.actionGuard.failed += 1;
        });
      };

      attach();

      window.__qaTakeReliabilitySnapshot = () => {
        attach();
        const snapshot = {
          performance: [...bag.performance],
          api: {
            success: bag.api.success,
            failure: [...bag.api.failure],
            ignoredFailure: bag.api.ignoredFailure,
          },
          actionGuard: { ...bag.actionGuard },
        };
        bag.performance.length = 0;
        bag.api.success = 0;
        bag.api.failure.length = 0;
        bag.api.ignoredFailure = 0;
        bag.actionGuard.started = 0;
        bag.actionGuard.blocked = 0;
        bag.actionGuard.succeeded = 0;
        bag.actionGuard.failed = 0;
        return snapshot;
      };
    },
    { selectedTheme: theme }
  );
};

const takeSnapshot = async (page) => {
  return page.evaluate(() => {
    if (typeof window.__qaTakeReliabilitySnapshot !== "function") {
      return null;
    }
    return window.__qaTakeReliabilitySnapshot();
  });
};

const mergeSnapshot = (snapshot, scope) => {
  if (!snapshot) {
    aggregate.notes.push(`[${scope}] snapshot is missing`);
    return;
  }

  for (const metric of snapshot.performance ?? []) {
    if (!metric?.name || !Number.isFinite(metric?.value)) continue;
    if (!(metric.name in aggregate.performance)) continue;
    aggregate.performance[metric.name].push(metric.value);
  }

  aggregate.api.success += snapshot.api?.success ?? 0;
  aggregate.api.failure += (snapshot.api?.failure ?? []).length;
  aggregate.api.ignoredFailures += snapshot.api?.ignoredFailure ?? 0;

  for (const failure of snapshot.api?.failure ?? []) {
    const code = failure?.code ?? "unknown";
    aggregate.api.failureByCode[code] = (aggregate.api.failureByCode[code] ?? 0) + 1;
  }

  aggregate.actionGuard.started += snapshot.actionGuard?.started ?? 0;
  aggregate.actionGuard.blocked += snapshot.actionGuard?.blocked ?? 0;
  aggregate.actionGuard.succeeded += snapshot.actionGuard?.succeeded ?? 0;
  aggregate.actionGuard.failed += snapshot.actionGuard?.failed ?? 0;
};

const loginAsStudent = async (context) => {
  if (!student?.email) return false;
  const request = context.request;
  const loginResponse = await request.post(`${baseUrl}/api/auth/magic-link`, {
    data: { email: student.email },
  });
  if (!loginResponse.ok()) return false;
  const loginPayload = await loginResponse.json();
  if (!loginPayload?.debugCode) return false;

  const confirmResponse = await request.post(`${baseUrl}/api/auth/magic-link/confirm`, {
    data: { email: student.email, code: loginPayload.debugCode },
  });

  return confirmResponse.ok();
};

const safeClick = async (locator) => {
  if ((await locator.count()) === 0) return false;
  await locator.first().click({ timeout: 10_000 });
  return true;
};

const runScenario = async (browser, scenario) => {
  const context = await browser.newContext({
    viewport: scenario.viewport,
  });
  await installTelemetryBridge(context, scenario.theme);
  const loggedIn = await loginAsStudent(context);
  if (!loggedIn) {
    aggregate.notes.push(`[${scenario.id}] Student auth fallback to guest.`);
  }

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(75_000);

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(200);
  mergeSnapshot(await takeSnapshot(page), `${scenario.id}:home`);

  await page.goto(`${baseUrl}/courses`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const searchInput = page.locator(
    "input[placeholder*='Поиск'], input[placeholder*='курс'], input[type='search']"
  );
  if ((await searchInput.count()) > 0) {
    await searchInput.first().click();
    await searchInput.first().fill("алгебра");
    await page.waitForTimeout(150);
    await searchInput.first().fill("");
  }

  const primaryCardAction = page
    .locator(
      ".course-card .MuiButton-root, .course-card button, .courses-page .MuiButton-root"
    )
    .first();
  if ((await primaryCardAction.count()) > 0) {
    await primaryCardAction.click({ timeout: 10_000 });
    await page.waitForTimeout(350);
  }
  mergeSnapshot(await takeSnapshot(page), `${scenario.id}:courses`);

  await page.goto(`${baseUrl}/booking`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);

  const openBookingButton = page
    .locator(".booking-page__actions .MuiButton-root")
    .first();
  const opened = await safeClick(openBookingButton);

  if (opened) {
    await page.waitForTimeout(250);
    const dayButton = page.locator(".booking-calendar__day.is-available").first();
    if ((await dayButton.count()) > 0) {
      await dayButton.click();
      await page.waitForTimeout(150);
    }
    const timeButton = page.locator(".booking-calendar__time").first();
    if ((await timeButton.count()) > 0) {
      await timeButton.click();
      await page.waitForTimeout(150);
    }

    const checkboxes = page.locator(".booking-dialog .MuiCheckbox-root input");
    const checkboxCount = await checkboxes.count();
    for (let index = 0; index < Math.min(checkboxCount, 2); index += 1) {
      const checkbox = checkboxes.nth(index);
      if (!(await checkbox.isChecked())) {
        await checkbox.click({ force: true });
      }
    }

    const confirmButton = page.locator(
      ".booking-dialog .MuiDialogActions-root .MuiButton-contained"
    ).last();
    if ((await confirmButton.count()) > 0) {
      await Promise.all([
        confirmButton.click({ timeout: 10_000 }),
        confirmButton.click({ timeout: 10_000 }),
      ]).catch(() => {
        // one of clicks may fail due fast state transition, keep scenario running
      });
      await page.waitForTimeout(450);
    }
  }

  mergeSnapshot(await takeSnapshot(page), `${scenario.id}:booking`);
  await context.close();
};

const evaluateGate = () => {
  const inpP75 = p75(aggregate.performance.INP);
  const apiRequests = aggregate.api.success + aggregate.api.failure;
  const apiErrorRate = apiRequests > 0 ? aggregate.api.failure / apiRequests : 0;
  const actionAttempts = aggregate.actionGuard.started + aggregate.actionGuard.blocked;
  const duplicateRate =
    actionAttempts > 0 ? aggregate.actionGuard.blocked / actionAttempts : 0;

  const failures = [];

  if (aggregate.performance.INP.length < thresholds.minInpSamples) {
    failures.push(
      `INP sample count ${aggregate.performance.INP.length} is below minimum ${thresholds.minInpSamples}`
    );
  }
  if (inpP75 > thresholds.inpP75Max) {
    failures.push(
      `INP p75 ${inpP75.toFixed(2)}ms exceeds threshold ${thresholds.inpP75Max}ms`
    );
  }

  if (apiRequests < thresholds.minApiRequests) {
    failures.push(
      `API request sample count ${apiRequests} is below minimum ${thresholds.minApiRequests}`
    );
  }
  if (apiErrorRate > thresholds.apiErrorRateMax) {
    failures.push(
      `API error rate ${(apiErrorRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.apiErrorRateMax * 100).toFixed(2)}%`
    );
  }

  if (actionAttempts > 0 && duplicateRate > thresholds.duplicateSubmitRateMax) {
    failures.push(
      `Duplicate submit rate ${(duplicateRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.duplicateSubmitRateMax * 100).toFixed(2)}%`
    );
  }

  return {
    failures,
    summary: {
      thresholds,
      inpP75,
      inpSamples: aggregate.performance.INP.length,
      lcpSamples: aggregate.performance.LCP.length,
      clsSamples: aggregate.performance.CLS.length,
      longTaskSamples: aggregate.performance.LONG_TASK.length,
      apiRequests,
      apiSuccess: aggregate.api.success,
      apiFailure: aggregate.api.failure,
      apiIgnoredFailures: aggregate.api.ignoredFailures,
      apiErrorRate,
      duplicateSubmitRate: duplicateRate,
      actionAttempts,
      actionGuard: aggregate.actionGuard,
      failureByCode: aggregate.api.failureByCode,
      notes: aggregate.notes,
    },
  };
};

try {
  await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of scenarios) {
      await runScenario(browser, scenario);
    }
  } finally {
    await browser.close();
  }

  const gate = evaluateGate();
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl,
        scenarios: scenarios.map((item) => item.id),
        ...gate.summary,
      },
      null,
      2
    )
  );

  console.log("Reliability SLO report:");
  console.log(`- INP p75: ${gate.summary.inpP75.toFixed(2)}ms`);
  console.log(`- INP samples: ${gate.summary.inpSamples}`);
  console.log(`- API requests: ${gate.summary.apiRequests}`);
  console.log(`- API error-rate: ${(gate.summary.apiErrorRate * 100).toFixed(2)}%`);
  console.log(
    `- Duplicate-submit rate: ${(gate.summary.duplicateSubmitRate * 100).toFixed(2)}%`
  );
  console.log(`- Report: ${path.relative(root, outputPath)}`);

  if (gate.failures.length > 0) {
    console.error("Reliability SLO gate failed:");
    for (const failure of gate.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Reliability SLO gate passed.");
} catch (error) {
  console.error("Reliability SLO gate execution failed:", error);
  process.exit(1);
} finally {
  stopServer();
}
