import { resolveHttpApiBase } from "@/shared/gateway/httpGateway";

type WorkbookLaunchPayload = {
  artifactId: string;
  launchUrl: string;
  expiresAt: string;
};

type WorkbookLaunchError = {
  error?: string;
  code?: string;
};

export type WorkbookLaunchResult = {
  ok: boolean;
  opened: boolean;
  launchUrl?: string;
  error?: string;
  code?: string;
};

export const WORKBOOK_POPUP_BLOCKED_MESSAGE =
  "Не удалось открыть рабочую тетрадь. Разрешите открытие всплывающих окон для этого сайта и попробуйте снова.";

const buildLaunchRequestUrl = () => {
  const base = resolveHttpApiBase();
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalizedBase}/workbook/launch`;
};

const buildAbsoluteLaunchUrl = (launchUrl: string) => {
  if (/^https?:\/\//i.test(launchUrl)) {
    return launchUrl;
  }

  const apiBase = resolveHttpApiBase();
  if (!/^https?:\/\//i.test(apiBase)) {
    return launchUrl;
  }

  const parsedApiBase = new URL(apiBase);
  return new URL(launchUrl, `${parsedApiBase.origin}/`).toString();
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

export const openExternalWhiteboard = async (params?: { from?: string }) => {
  const response = await fetch(buildLaunchRequestUrl(), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: typeof params?.from === "string" ? params.from : undefined,
    }),
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object"
        ? (payload as WorkbookLaunchError)
        : {};
    return {
      ok: false,
      opened: false,
      error:
        typeof errorPayload.error === "string" && errorPayload.error.trim()
          ? errorPayload.error
          : "Не удалось открыть рабочую тетрадь.",
      code:
        typeof errorPayload.code === "string" && errorPayload.code.trim()
          ? errorPayload.code
          : undefined,
    } satisfies WorkbookLaunchResult;
  }

  const launchPayload =
    payload && typeof payload === "object"
      ? (payload as Partial<WorkbookLaunchPayload>)
      : null;

  if (!launchPayload?.launchUrl || typeof launchPayload.launchUrl !== "string") {
    return {
      ok: false,
      opened: false,
      error: "Не удалось получить ссылку запуска рабочей тетради.",
      code: "board_launch_unavailable",
    } satisfies WorkbookLaunchResult;
  }

  if (typeof window === "undefined") {
    return {
      ok: true,
      opened: false,
      launchUrl: launchPayload.launchUrl,
      code: "board_launch_unavailable",
    } satisfies WorkbookLaunchResult;
  }

  const target = buildAbsoluteLaunchUrl(launchPayload.launchUrl);
  const win = window.open(target, "_blank", "noopener,noreferrer");
  if (!win) {
    return {
      ok: true,
      opened: false,
      launchUrl: target,
      code: "popup_blocked",
    } satisfies WorkbookLaunchResult;
  }

  return {
    ok: true,
    opened: true,
    launchUrl: target,
  } satisfies WorkbookLaunchResult;
};
