import { chromium, firefox, webkit } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:5173";
const ROUTES = ["/", "/courses", "/student/profile?tab=profile", "/teacher/profile?tab=profile"];
const TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "25000", 10);

const BROWSERS = [
  { name: "chromium", type: chromium },
  { name: "firefox", type: firefox },
  { name: "webkit", type: webkit },
];

const asMessage = (value) => (value instanceof Error ? value.message : String(value));
const isIgnorableDevSocketError = (message) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("websocket closed without opened") ||
    normalized.includes("websocket connection to") ||
    normalized.includes("connection to the server at ws://") ||
    normalized.includes("server at ws://") ||
    normalized.includes("hmr")
  );
};

const runBrowserSmoke = async ({ name, type }) => {
  const browser = await type.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const browserResult = {
    name,
    ok: true,
    routes: [],
  };

  try {
    for (const route of ROUTES) {
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (error) => pageErrors.push(asMessage(error)));
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      const url = `${BASE_URL}${route}`;
      let status = null;
      let routeOk = true;
      let reason = "";
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: TIMEOUT_MS,
        });
        status = response?.status() ?? null;
        if (status !== null && status >= 400) {
          routeOk = false;
          reason = `HTTP ${status}`;
        } else {
          await page.waitForTimeout(300);
        }
      } catch (error) {
        routeOk = false;
        reason = asMessage(error);
      }

      const relevantPageErrors = pageErrors.filter(
        (message) => !isIgnorableDevSocketError(message)
      );
      const relevantConsoleErrors = consoleErrors.filter(
        (message) => !isIgnorableDevSocketError(message)
      );

      if (relevantPageErrors.length > 0) {
        routeOk = false;
        reason = reason
          ? `${reason}; pageerror: ${relevantPageErrors[0]}`
          : `pageerror: ${relevantPageErrors[0]}`;
      } else if (relevantConsoleErrors.length > 0) {
        routeOk = false;
        reason = reason
          ? `${reason}; console: ${relevantConsoleErrors[0]}`
          : `console: ${relevantConsoleErrors[0]}`;
      }

      browserResult.routes.push({
        route,
        ok: routeOk,
        status,
        pageErrors: relevantPageErrors.length,
        consoleErrors: relevantConsoleErrors.length,
        reason,
      });

      if (!routeOk) {
        browserResult.ok = false;
      }

      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return browserResult;
};

const printSummary = (result) => {
  const statusMark = result.ok ? "OK" : "FAIL";
  console.log(`\n[${result.name}] ${statusMark}`);
  for (const route of result.routes) {
    const routeMark = route.ok ? "✓" : "✗";
    const statusLabel = route.status === null ? "-" : String(route.status);
    const details = route.reason ? ` | ${route.reason}` : "";
    console.log(
      `  ${routeMark} ${route.route} | status: ${statusLabel} | pageErrors: ${route.pageErrors} | consoleErrors: ${route.consoleErrors}${details}`
    );
  }
};

const main = async () => {
  const allResults = [];
  let hasFailure = false;

  for (const browser of BROWSERS) {
    try {
      const result = await runBrowserSmoke(browser);
      allResults.push(result);
      printSummary(result);
      if (!result.ok) hasFailure = true;
    } catch (error) {
      hasFailure = true;
      const reason = asMessage(error);
      console.log(`\n[${browser.name}] FAIL`);
      console.log(`  ✗ browser launch failed: ${reason}`);
    }
  }

  if (hasFailure) {
    console.error(
      "\nCross-browser smoke failed. Fix issues above and rerun `npm run smoke:cross-browser`."
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nCross-browser smoke passed.");
};

await main();
