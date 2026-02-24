import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { chromium } from "playwright";

const root = process.cwd();
const host = process.env.MODAL_SMOKE_HOST ?? "127.0.0.1";
const port = Number(process.env.MODAL_SMOKE_PORT ?? 4173);
const baseUrl = process.env.MODAL_SMOKE_BASE_URL ?? `http://${host}:${port}`;
const serverMode = process.env.MODAL_SMOKE_SERVER ?? "dev";
const viewport = { width: 390, height: 844 };
const themes = ["dark", "light"];

const dbPath = path.join(root, "mock-db.json");
const db = fs.existsSync(dbPath)
  ? JSON.parse(fs.readFileSync(dbPath, "utf-8"))
  : { users: [] };

const users = Array.isArray(db?.users) ? db.users : [];
const teacher = users.find((user) => user?.role === "teacher") ?? null;
const student = users.find((user) => user?.role === "student") ?? null;

const issues = [];
const notes = [];

const pushIssue = (scope, message) => {
  issues.push(`[${scope}] ${message}`);
};

const readOutboxAuthCode = (email, requestedAtMs) => {
  try {
    const raw = fs.readFileSync(dbPath, "utf-8");
    const snapshot = JSON.parse(raw);
    const outboxRaw = snapshot?.outbox;
    const outboxItems = Array.isArray(outboxRaw)
      ? outboxRaw
      : Object.values(outboxRaw ?? {});
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const candidates = outboxItems
      .filter((item) => item && typeof item === "object")
      .filter(
        (item) =>
          String(item.template ?? "") === "auth_code" &&
          String(item.recipientEmail ?? "").trim().toLowerCase() ===
            normalizedEmail
      )
      .map((item) => {
        const createdAtMs = Date.parse(String(item.createdAt ?? item.updatedAt ?? ""));
        let parsedPayload = null;
        try {
          parsedPayload =
            typeof item.payload === "string" ? JSON.parse(item.payload) : item.payload;
        } catch {
          parsedPayload = null;
        }
        const authCode = parsedPayload?.authCode;
        return {
          createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
          authCode: typeof authCode === "string" ? authCode : null,
        };
      })
      .filter((item) => Boolean(item.authCode));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.createdAtMs - a.createdAtMs);
    const fresh = candidates.find((item) => item.createdAtMs >= requestedAtMs - 1_000);
    return fresh ? fresh.authCode : null;
  } catch {
    return null;
  }
};

const waitOutboxAuthCode = async (email, requestedAtMs, timeoutMs = 6_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const code = readOutboxAuthCode(email, requestedAtMs);
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
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
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
};

const createContext = async (
  browser,
  { theme, storageState = undefined, authUser = null }
) => {
  const context = await browser.newContext({ viewport, storageState });
  await context.addInitScript(
    ({ selectedTheme, user }) => {
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
      try {
        if (user) {
          localStorage.setItem("math-tutor-auth", JSON.stringify(user));
        } else {
          localStorage.removeItem("math-tutor-auth");
        }
      } catch {
        // ignore
      }
    },
    { selectedTheme: theme, user: authUser }
  );
  return context;
};

const authenticateByMagicCode = async (context, email, scope) => {
  try {
    const requestedAtMs = Date.now();
    const requestCodeResponse = await context.request.post(
      `${baseUrl}/api/auth/magic-link`,
      {
        data: { email },
      }
    );
    if (!requestCodeResponse.ok()) {
      pushIssue(
        scope,
        `Magic-link request failed with HTTP ${requestCodeResponse.status()}.`
      );
      return false;
    }
    const requestCodePayload = await requestCodeResponse.json();
    if (!requestCodePayload?.ok) {
      pushIssue(
        scope,
        `Magic-link request declined: ${requestCodePayload?.message ?? "unknown reason"}.`
      );
      return false;
    }
    const resolvedCode =
      requestCodePayload?.debugCode ||
      (await waitOutboxAuthCode(email, requestedAtMs));
    if (!resolvedCode) {
      pushIssue(scope, "Magic-link code is unavailable for smoke auth.");
      return { ok: false, user: null };
    }
    const confirmResponse = await context.request.post(
      `${baseUrl}/api/auth/magic-link/confirm`,
      {
        data: { email, code: resolvedCode },
      }
    );
    if (!confirmResponse.ok()) {
      const errorPayload = await confirmResponse.json().catch(() => null);
      pushIssue(
        scope,
        `Magic-link confirm failed with HTTP ${confirmResponse.status()}: ${
          errorPayload?.error ?? "unknown error"
        }`
      );
      return { ok: false, user: null };
    }
    const sessionResponse = await context.request.get(`${baseUrl}/api/auth/session`);
    const sessionUser = sessionResponse.ok() ? await sessionResponse.json() : null;
    return { ok: true, user: sessionUser };
  } catch (error) {
    pushIssue(
      scope,
      `Magic-link auth failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ok: false, user: null };
  }
};

const assertDialogLayout = async (page, { selector, scope }) => {
  const paperLocator = page.locator(`${selector} .MuiDialog-paper:visible`).last();
  const count = await page.locator(`${selector} .MuiDialog-paper:visible`).count();
  if (count === 0) {
    pushIssue(scope, `Dialog "${selector}" is not visible.`);
    return;
  }

  const paper = await paperLocator.elementHandle();
  if (!paper) {
    pushIssue(scope, `Dialog "${selector}" has no paper element handle.`);
    return;
  }

  const metrics = await paper.evaluate((node) => ({
    width: node.clientWidth,
    height: node.clientHeight,
    scrollWidth: node.scrollWidth,
    scrollHeight: node.scrollHeight,
  }));

  if (metrics.width > viewport.width - 2) {
    pushIssue(
      scope,
      `Dialog width ${metrics.width}px exceeds viewport width ${viewport.width}px.`
    );
  }
  if (metrics.scrollWidth > metrics.width + 1) {
    pushIssue(scope, "Dialog content has horizontal overflow.");
  }

  const actionMetrics = await page.$$eval(
    `${selector} .MuiDialogActions-root .MuiButton-root:visible, ${selector} .MuiDialogActions-root .ui-btn:visible`,
    (elements) =>
      elements.map((node) => {
        const text = (node.textContent ?? "").trim();
        return {
          text,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        };
      })
  );

  actionMetrics.forEach((item) => {
    if (!item.text) return;
    if (item.scrollWidth > item.clientWidth + 1) {
      pushIssue(
        scope,
        `Button text overflow detected for "${item.text}" (${item.scrollWidth}px > ${item.clientWidth}px).`
      );
    }
    if (item.scrollHeight > item.clientHeight + 2) {
      notes.push(
        `[${scope}] Button "${item.text}" wraps onto multiple lines (${item.clientHeight}px -> ${item.scrollHeight}px).`
      );
    }
  });
};

const openAuthModal = async (page, scope) => {
  await page.goto(`${baseUrl}/courses`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const loginButton = page.getByRole("button", { name: "Войти" }).first();
  if ((await loginButton.count()) === 0) {
    pushIssue(scope, "Header login button not found.");
    return;
  }
  await loginButton.click();
  await page.waitForTimeout(300);
  await assertDialogLayout(page, { selector: ".auth-modal", scope });
  await page.keyboard.press("Escape");
};

const openBookingModal = async (page, scope) => {
  await page.goto(`${baseUrl}/booking`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForSelector(".booking-page__actions", { timeout: 20_000 });
  let trigger = page
    .locator(".booking-page__actions .MuiButton-root")
    .first();
  if ((await trigger.count()) === 0) {
    trigger = page.getByRole("button", { name: /Записаться/i }).first();
  }
  if ((await trigger.count()) === 0) {
    pushIssue(scope, "Booking trigger button not found.");
    return;
  }
  await trigger.click();
  await page.waitForTimeout(300);
  await assertDialogLayout(page, { selector: ".booking-dialog", scope });
  await page.keyboard.press("Escape");
};

const openCourseAndLessonEditors = async (page, scope) => {
  await page.goto(`${baseUrl}/teacher/profile?tab=courses`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(500);
  const dashboardRoot = page.locator(".teacher-dashboard").first();
  if ((await dashboardRoot.count()) === 0) {
    pushIssue(scope, `Teacher dashboard root not found at URL: ${page.url()}`);
    return;
  }
  const coursesTabByName = page.getByRole("tab", { name: /Курсы/i }).first();
  if ((await coursesTabByName.count()) > 0) {
    await coursesTabByName.click();
    await page.waitForTimeout(400);
  } else {
    const coursesTab = page
      .locator(".teacher-dashboard .MuiTabs-root .MuiTab-root")
      .nth(2);
    if ((await coursesTab.count()) > 0) {
      await coursesTab.click();
      await page.waitForTimeout(400);
    }
  }

  let createCourseButton = page
    .locator(".teacher-dashboard__section-actions .MuiButton-root")
    .first();
  if ((await createCourseButton.count()) > 0) {
    await createCourseButton.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
  }
  if ((await createCourseButton.count()) === 0) {
    createCourseButton = page
      .getByRole("button", { name: /Создать курс/i })
      .first();
  }
  if ((await createCourseButton.count()) === 0) {
    const visibleButtons = await page.$$eval("button", (nodes) =>
      nodes
        .map((node) => (node.textContent ?? "").trim())
        .filter(Boolean)
        .slice(0, 12)
    );
    pushIssue(scope, "Create course button not found.");
    notes.push(`[${scope}] URL: ${page.url()}`);
    notes.push(
      `[${scope}] First visible button texts: ${visibleButtons.join(" | ") || "none"}`
    );
    return;
  }
  await createCourseButton.click();
  await page.waitForTimeout(300);
  await assertDialogLayout(page, { selector: ".course-editor-dialog", scope });

  let addLessonButton = page.getByRole("button", { name: /Добавить урок/i }).first();
  if ((await addLessonButton.count()) === 0) {
    addLessonButton = page
      .locator(".course-editor-dialog .MuiIconButton-root[aria-label]")
      .first();
  }
  if ((await addLessonButton.count()) === 0) {
    pushIssue(scope, "Add lesson button not found in course editor.");
    await page.keyboard.press("Escape");
    return;
  }
  await addLessonButton.click();
  await page.waitForTimeout(300);
  await assertDialogLayout(page, { selector: ".lesson-editor-dialog", scope });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
};

const openStudentProfileDialog = async (page, scope) => {
  await page.goto(`${baseUrl}/student/profile`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const lessonsTab = page.locator(".student-profile .MuiTabs-root .MuiTab-root").nth(2);
  if ((await lessonsTab.count()) > 0) {
    await lessonsTab.click();
    await page.waitForTimeout(300);
  }

  let editButton = page.getByRole("button", { name: "Перенести занятие" }).first();
  if ((await editButton.count()) === 0) {
    const day = page.locator(".student-profile__calendar-day.is-available").first();
    if ((await day.count()) > 0) {
      await day.click();
      const slot = page.locator(".student-profile__calendar-time").first();
      if ((await slot.count()) > 0) {
        await slot.click();
        const bookButton = page
          .getByRole("button", { name: "Записаться на занятие" })
          .first();
        if ((await bookButton.count()) > 0) {
          await bookButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
    editButton = page.getByRole("button", { name: "Перенести занятие" }).first();
  }

  if ((await editButton.count()) === 0) {
    notes.push(
      `[${scope}] Student reschedule dialog was not opened (no editable scheduled bookings found).`
    );
    return;
  }

  await editButton.click();
  await page.waitForTimeout(300);
  await assertDialogLayout(page, { selector: ".student-profile-dialog", scope });
  await page.keyboard.press("Escape");
};

let previewProcess = null;
const startPreview = async () => {
  const runner = process.platform === "win32" ? "npm.cmd" : "npm";
  const runnerArgs =
    serverMode === "preview"
      ? ["run", "preview", "--", "--host", host, "--port", String(port), "--strictPort"]
      : ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"];

  previewProcess = spawn(
    runner,
    runnerArgs,
    {
      cwd: root,
      stdio: "pipe",
      env: process.env,
    }
  );

  const ready = await waitForUrl(`${baseUrl}/`);
  if (!ready) {
    throw new Error(`Preview server is not reachable at ${baseUrl}`);
  }
};

const stopPreview = () => {
  if (previewProcess) {
    previewProcess.kill("SIGTERM");
    previewProcess = null;
  }
};

if (!teacher) {
  pushIssue("setup", "Teacher user is missing in mock-db.json.");
}
if (!student) {
  pushIssue("setup", "Student user is missing in mock-db.json.");
}

try {
  await startPreview();
  const browser = await chromium.launch({ headless: true });

  try {
    let studentState = null;
    let studentSessionUser = null;
    let teacherState = null;
    let teacherSessionUser = null;

    if (student) {
      const authContext = await browser.newContext({ viewport });
      const authResult = await authenticateByMagicCode(
        authContext,
        student.email,
        "setup/student-auth"
      );
      if (authResult.ok) {
        studentState = await authContext.storageState();
        studentSessionUser = authResult.user;
      }
      await authContext.close();
    }

    if (teacher) {
      const authContext = await browser.newContext({ viewport });
      const authResult = await authenticateByMagicCode(
        authContext,
        teacher.email,
        "setup/teacher-auth"
      );
      if (authResult.ok) {
        teacherState = await authContext.storageState();
        teacherSessionUser = authResult.user;
      }
      await authContext.close();
    }

    for (const theme of themes) {
      {
        const scope = `${theme}/auth-modal`;
        const context = await createContext(browser, { theme });
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(90_000);
        await openAuthModal(page, scope);
        await context.close();
      }

      if (studentState) {
        const context = await createContext(browser, {
          theme,
          storageState: studentState,
          authUser: studentSessionUser,
        });
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(90_000);
        await openBookingModal(page, `${theme}/booking-modal`);
        await openStudentProfileDialog(page, `${theme}/student-profile-dialog`);
        await context.close();
      }

      if (teacherState) {
        const context = await createContext(browser, {
          theme,
          storageState: teacherState,
          authUser: teacherSessionUser,
        });
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(90_000);
        await openCourseAndLessonEditors(page, `${theme}/teacher-editors`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
} catch (error) {
  pushIssue("runtime", error instanceof Error ? error.message : String(error));
} finally {
  stopPreview();
}

if (notes.length > 0) {
  console.log("Modal smoke notes:");
  notes.forEach((note) => console.log(`- ${note}`));
}

if (issues.length > 0) {
  console.error("Modal smoke failed:");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Modal smoke passed.");
console.log("Checked: Auth, Course editor, Lesson editor, Booking, Student profile.");
console.log(`Viewport: ${viewport.width}x${viewport.height}; themes: ${themes.join(", ")}.`);
