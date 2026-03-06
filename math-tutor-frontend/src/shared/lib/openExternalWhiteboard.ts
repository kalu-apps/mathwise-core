const DEFAULT_WHITEBOARD_URL = "https://avk-mathboard-iwan-kalugin13.amvera.io";

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

export const getWhiteboardBaseUrl = () => {
  const envValue = import.meta.env.VITE_WHITEBOARD_BASE_URL;
  if (typeof envValue !== "string" || envValue.trim().length === 0) {
    return DEFAULT_WHITEBOARD_URL;
  }
  return trimTrailingSlashes(envValue.trim());
};

export const buildWhiteboardLaunchUrl = (params?: { from?: string }) => {
  const target = new URL("/workbook", getWhiteboardBaseUrl());
  const from = typeof params?.from === "string" ? params.from.trim() : "";
  if (from) {
    target.searchParams.set("from", from);
  }
  return target.toString();
};

export const openExternalWhiteboard = (params?: { from?: string }) => {
  if (typeof window === "undefined") return false;
  const targetUrl = buildWhiteboardLaunchUrl(params);
  window.open(targetUrl, "_blank", "noopener,noreferrer");
  return true;
};

