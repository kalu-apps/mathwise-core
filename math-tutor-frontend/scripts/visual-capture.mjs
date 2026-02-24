import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const root = process.cwd();
const matrixPath = path.join(root, "docs/visual-regression-matrix.json");
const target = process.env.VISUAL_CAPTURE_TARGET === "baseline" ? "baseline" : "current";
const strict = process.env.VISUAL_CAPTURE_STRICT === "1";
const port = Number(process.env.VISUAL_CAPTURE_PORT ?? 4173);
const host = process.env.VISUAL_CAPTURE_HOST ?? "127.0.0.1";
const explicitBaseUrl = process.env.VISUAL_CAPTURE_BASE_URL;
const baseUrl = explicitBaseUrl || `http://${host}:${port}`;

if (!fs.existsSync(matrixPath)) {
  console.error("visual-capture: matrix missing. Run `npm run visual:matrix` first.");
  process.exit(1);
}

let chromium;
try {
  const pw = await import("playwright");
  chromium = pw.chromium;
} catch {
  const message =
    "visual-capture: playwright is not installed in this environment. Install `playwright` for screenshot capture.";
  if (strict) {
    console.error(message);
    process.exit(1);
  }
  console.log(`${message} Skipping (non-strict mode).`);
  process.exit(0);
}

const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf-8"));
const scenarios = Array.isArray(matrix.scenarios) ? matrix.scenarios : [];
if (scenarios.length === 0) {
  console.log("visual-capture: no scenarios in matrix.");
  process.exit(0);
}

const readDb = () => {
  const dbPath = path.join(root, "mock-db.json");
  if (!fs.existsSync(dbPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  } catch {
    return null;
  }
};

const db = readDb();
const users = Array.isArray(db?.users) ? db.users : [];
const courses = Array.isArray(db?.courses) ? db.courses : [];
const lessons = Array.isArray(db?.lessons) ? db.lessons : [];
const bookings = Array.isArray(db?.bookings) ? db.bookings : [];

const teacher =
  users.find((u) => u?.role === "teacher") ?? {
    id: "teacher-demo",
    email: "kaluginivan13@gmail.com",
    firstName: "Teacher",
    lastName: "Demo",
    role: "teacher",
  };

const student =
  users.find((u) => u?.role === "student") ?? {
    id: "student-demo",
    email: "student.demo@example.com",
    firstName: "Student",
    lastName: "Demo",
    role: "student",
  };

const firstCourse = courses[0] ?? null;
const courseId = firstCourse?.id ?? "missing-course";
const firstLessonForCourse = lessons.find((l) => l?.courseId === courseId) ?? lessons[0] ?? null;
const lessonId = firstLessonForCourse?.id ?? "missing-lesson";
const studentIdFromBookings = bookings.find((b) => b?.studentId)?.studentId;
const studentId = student.id || studentIdFromBookings || "missing-student";

const waitForUrl = async (url, timeoutMs = 45_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status === 404) {
        return true;
      }
    } catch {
      // continue polling
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
};

const resolveRoute = (scenarioRoute) => {
  const withCourse = scenarioRoute.replace("{courseId}", courseId);
  const withLesson = withCourse.replace("{lessonId}", lessonId);
  const withStudent = withLesson.replace("{studentId}", studentId);
  if (withStudent === "{contextual}") {
    return "/courses";
  }
  return withStudent;
};

const authForScreen = (screen) => {
  if (screen === "student-profile") return student;
  if (screen === "teacher-profile" || screen === "teacher-student") return teacher;
  return null;
};

let previewProc = null;
if (!explicitBaseUrl) {
  previewProc = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "preview", "--", "--host", host, "--port", String(port), "--strictPort"],
    {
      cwd: root,
      stdio: "pipe",
      env: process.env,
    }
  );

  previewProc.stdout.on("data", () => {
    // keep process alive and quiet
  });
  previewProc.stderr.on("data", () => {
    // keep process alive and quiet
  });

  const ready = await waitForUrl(`${baseUrl}/`);
  if (!ready) {
    if (previewProc) {
      previewProc.kill("SIGTERM");
    }
    console.error(`visual-capture: preview server is not reachable at ${baseUrl}`);
    process.exit(1);
  }
}

const browser = await chromium.launch({ headless: true });
let failed = false;
let captured = 0;

try {
  for (const scenario of scenarios) {
    const route = resolveRoute(scenario.route);
    const authUser = authForScreen(scenario.screen);
    const shotPath = path.join(root, target === "baseline" ? scenario.baseline : scenario.current);
    fs.mkdirSync(path.dirname(shotPath), { recursive: true });

    const context = await browser.newContext({ viewport: scenario.viewport });
    await context.addInitScript(
      ({ theme, authUserInit }) => {
        try {
          document.documentElement.setAttribute("data-theme", theme);
        } catch {
          // ignore
        }
        try {
          if (authUserInit) {
            localStorage.setItem("math-tutor-auth", JSON.stringify(authUserInit));
          } else {
            localStorage.removeItem("math-tutor-auth");
          }
        } catch {
          // ignore
        }
      },
      {
        theme: scenario.theme,
        authUserInit: authUser,
      }
    );

    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      await page.waitForTimeout(600);

      if (scenario.screen === "dialogs-overlay") {
        const loginBtn = page
          .locator('button:has-text("Войти"), [role="button"]:has-text("Войти")')
          .first();
        if ((await loginBtn.count()) > 0) {
          await loginBtn.click({ timeout: 2500 });
          await page.waitForTimeout(400);
        }
      }

      await page.screenshot({
        path: shotPath,
        fullPage: true,
        animations: "disabled",
      });
      captured += 1;
    } catch (error) {
      failed = true;
      console.error(`visual-capture: failed for ${scenario.id} (${route})`);
      console.error(error instanceof Error ? error.message : String(error));
      if (strict) {
        await context.close();
        break;
      }
    }

    await context.close();
  }
} finally {
  await browser.close();
  if (previewProc) {
    previewProc.kill("SIGTERM");
  }
}

console.log(
  `visual-capture completed. target=${target}, total=${scenarios.length}, captured=${captured}, failed=${failed}`
);

if (failed && strict) {
  process.exit(1);
}
