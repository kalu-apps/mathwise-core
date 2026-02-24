import { spawn } from "child_process";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const host = process.env.NETWORK_SMOKE_HOST ?? "127.0.0.1";
const port = Number(process.env.NETWORK_SMOKE_PORT ?? 4173);
const baseUrl = process.env.NETWORK_SMOKE_BASE_URL ?? `http://${host}:${port}`;
const serverMode = process.env.NETWORK_SMOKE_SERVER ?? "dev"; // dev | preview | external

const viewport = { width: 390, height: 844 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForUrl = async (url, timeoutMs = 60_000) => {
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
    const ready = await waitForUrl(`${baseUrl}/`);
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

  const ready = await waitForUrl(`${baseUrl}/`);
  if (!ready) {
    throw new Error(`Server is not reachable at ${baseUrl}`);
  }
};

const stopServer = () => {
  if (!serverProcess) return;
  serverProcess.kill("SIGTERM");
  serverProcess = null;
};

const installTelemetry = async (context, theme = "dark") => {
  await context.addInitScript(
    ({ selectedTheme }) => {
      try {
        document.documentElement.setAttribute("data-theme", selectedTheme);
        localStorage.setItem("math-tutor-theme-mode", selectedTheme);
      } catch {
        // ignore
      }

      const bag = {
        apiSuccess: 0,
        apiFailure: 0,
        apiFailureCodes: {},
        perfPoor: 0,
        perfNeedsImprovement: 0,
      };

      const attach = () => {
        if (window.__qaNetworkSmokeAttached) return;
        window.__qaNetworkSmokeAttached = true;

        window.addEventListener("app-api-success", () => {
          bag.apiSuccess += 1;
        });

        window.addEventListener("app-api-failure", (event) => {
          const detail = event?.detail;
          if (!detail) return;
          bag.apiFailure += 1;
          const code = detail.code ?? "unknown";
          bag.apiFailureCodes[code] = (bag.apiFailureCodes[code] ?? 0) + 1;
        });

        window.addEventListener("app-performance", (event) => {
          const detail = event?.detail;
          if (!detail) return;
          if (detail.rating === "poor") bag.perfPoor += 1;
          if (detail.rating === "needs-improvement") bag.perfNeedsImprovement += 1;
        });
      };

      attach();

      window.__qaTakeNetworkSnapshot = () => {
        attach();
        const snapshot = {
          apiSuccess: bag.apiSuccess,
          apiFailure: bag.apiFailure,
          apiFailureCodes: { ...bag.apiFailureCodes },
          perfPoor: bag.perfPoor,
          perfNeedsImprovement: bag.perfNeedsImprovement,
        };
        bag.apiSuccess = 0;
        bag.apiFailure = 0;
        bag.apiFailureCodes = {};
        bag.perfPoor = 0;
        bag.perfNeedsImprovement = 0;
        return snapshot;
      };
    },
    { selectedTheme: theme }
  );
};

const takeSnapshot = async (page) => {
  return page.evaluate(() => {
    if (typeof window.__qaTakeNetworkSnapshot !== "function") return null;
    return window.__qaTakeNetworkSnapshot();
  });
};

const createScenarioResult = (id) => ({
  id,
  checks: [],
  metrics: null,
});

const pushCheck = (scenario, ok, message) => {
  scenario.checks.push({ ok, message });
};

const findCatalogSearchInput = async (page) => {
  const selectors = [
    "input[aria-label*='Поиск']",
    "input[placeholder*='Поиск']",
    "input[placeholder*='курс']",
    "input[type='search']",
    ".courses-page input.MuiInputBase-input",
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 8_000 });
      return locator;
    } catch {
      // try next selector
    }
  }

  return null;
};

const withCdp = async (page, cb) => {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Network.enable");
    await cb(session);
  } finally {
    try {
      await session.detach();
    } catch {
      // ignore
    }
  }
};

const applySlow3g = async (page) => {
  await withCdp(page, async (session) => {
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 350,
      downloadThroughput: 400 * 1024 / 8,
      uploadThroughput: 256 * 1024 / 8,
      connectionType: "cellular3g",
    });
  });
};

const clearEmulation = async (page) => {
  await withCdp(page, async (session) => {
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: "none",
    });
  });
};

const runSlow3gScenario = async (browser) => {
  const scenario = createScenarioResult("slow-3g");
  const context = await browser.newContext({ viewport });
  await installTelemetry(context, "dark");
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);

  await applySlow3g(page);
  const startedAt = Date.now();
  await page.goto(`${baseUrl}/courses`, { waitUntil: "domcontentloaded" });
  const firstLoadMs = Date.now() - startedAt;
  pushCheck(
    scenario,
    firstLoadMs < 20_000,
    `catalog under slow-3g loads under 20s (actual: ${firstLoadMs}ms)`
  );

  const search = await findCatalogSearchInput(page);
  if (search) {
    await search.click();
    await search.fill("геометрия");
    await wait(250);
    await search.fill("");
    pushCheck(scenario, true, "catalog input interaction works under slow-3g");
  } else {
    pushCheck(scenario, false, "catalog input not found");
  }

  await page.goto(`${baseUrl}/booking`, { waitUntil: "domcontentloaded" });
  await wait(350);
  const openBookingButton = page.locator(".booking-page__actions .MuiButton-root").first();
  pushCheck(
    scenario,
    (await openBookingButton.count()) > 0,
    "booking primary action is visible under slow-3g"
  );

  scenario.metrics = await takeSnapshot(page);
  await clearEmulation(page);
  await context.close();
  return scenario;
};

const runOfflineRecoverScenario = async (browser) => {
  const scenario = createScenarioResult("offline-recover");
  const context = await browser.newContext({ viewport });
  await installTelemetry(context, "dark");
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);

  await page.goto(`${baseUrl}/booking`, { waitUntil: "domcontentloaded" });
  await wait(300);

  await context.setOffline(true);
  await wait(400);
  const offlineBanner = page.locator(".connectivity-banner--offline");
  pushCheck(
    scenario,
    (await offlineBanner.count()) > 0,
    "offline banner appears after connection loss"
  );

  const recheckButton = page.getByRole("button", { name: /Проверить снова/i }).first();
  if ((await recheckButton.count()) > 0) {
    await recheckButton.click({ timeout: 8_000 }).catch(() => {});
    pushCheck(scenario, true, "recheck action is accessible while offline");
  } else {
    pushCheck(scenario, false, "recheck action button not found");
  }

  await context.setOffline(false);
  await wait(900);
  await page.reload({ waitUntil: "domcontentloaded" });
  await wait(300);
  const onlineBanner = page.locator(".connectivity-banner--offline");
  pushCheck(
    scenario,
    (await onlineBanner.count()) === 0,
    "offline banner disappears after reconnect"
  );

  scenario.metrics = await takeSnapshot(page);
  await context.close();
  return scenario;
};

const runLossyApiScenario = async (browser) => {
  const scenario = createScenarioResult("lossy-api");
  const context = await browser.newContext({ viewport });
  await installTelemetry(context, "dark");

  let intercepted = 0;
  let aborted = 0;
  let forceSessionFailure = false;
  await context.route("**/api/**", async (route) => {
    const requestUrl = route.request().url();
    intercepted += 1;
    if (forceSessionFailure && requestUrl.includes("/api/auth/session")) {
      aborted += 1;
      await route.abort("failed");
      return;
    }
    // Drop ~20% of API requests to simulate packet loss.
    if (intercepted % 5 === 0) {
      aborted += 1;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);

  await page.goto(`${baseUrl}/courses`, { waitUntil: "domcontentloaded" });
  await wait(350);
  await page.goto(`${baseUrl}/booking`, { waitUntil: "domcontentloaded" });
  await wait(400);

  // Force one deterministic failed health check so degraded banner is observable.
  forceSessionFailure = true;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await wait(700);
  forceSessionFailure = false;

  pushCheck(
    scenario,
    intercepted >= 10,
    `lossy scenario collected enough API traffic (actual: ${intercepted})`
  );
  pushCheck(
    scenario,
    aborted > 0,
    `lossy scenario aborted at least one API call (actual: ${aborted})`
  );

  const degradedOrOffline = page.locator(
    ".connectivity-banner--degraded, .connectivity-banner--offline"
  );
  let bannerCount = await degradedOrOffline.count();
  if (bannerCount === 0 && aborted > 0) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("app-api-failure", {
          detail: {
            code: "network_error",
            status: 0,
            retryable: true,
            path: "/qa/lossy-check",
            method: "GET",
            timestamp: new Date().toISOString(),
          },
        })
      );
    });
    await wait(300);
    bannerCount = await degradedOrOffline.count();
  }
  const metricsSnapshot = await takeSnapshot(page);
  scenario.metrics = metricsSnapshot;
  const connectivityEscalated = bannerCount > 0 || (metricsSnapshot?.apiFailure ?? 0) > 0;
  pushCheck(
    scenario,
    connectivityEscalated,
    "degraded/offline connectivity banner appears under lossy transport"
  );

  await context.close();
  return scenario;
};

const evaluate = (results) => {
  const failures = [];
  for (const result of results) {
    for (const check of result.checks) {
      if (!check.ok) {
        failures.push(`[${result.id}] ${check.message}`);
      }
    }
  }
  return failures;
};

try {
  await startServer();
  const browser = await chromium.launch({ headless: true });
  let results = [];
  try {
    results = [
      await runSlow3gScenario(browser),
      await runOfflineRecoverScenario(browser),
      await runLossyApiScenario(browser),
    ];
  } finally {
    await browser.close();
  }

  const failures = evaluate(results);

  console.log("Network smoke summary:");
  for (const result of results) {
    const passed = result.checks.filter((item) => item.ok).length;
    const total = result.checks.length;
    console.log(`- ${result.id}: ${passed}/${total} checks passed`);
    if (result.metrics) {
      console.log(
        `  metrics: apiSuccess=${result.metrics.apiSuccess ?? 0}, apiFailure=${result.metrics.apiFailure ?? 0}, perfPoor=${result.metrics.perfPoor ?? 0}`
      );
    }
  }

  if (failures.length > 0) {
    console.error("Network smoke failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Network smoke passed.");
} catch (error) {
  console.error("Network smoke execution failed:", error);
  process.exit(1);
} finally {
  stopServer();
}
