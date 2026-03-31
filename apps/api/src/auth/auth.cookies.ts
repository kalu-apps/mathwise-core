import { getApiRuntimeConfig } from "../config/runtime.config";

const runtimeConfig = getApiRuntimeConfig();

export const AUTH_SESSION_COOKIE_NAME = runtimeConfig.authSessionCookieName;

const buildCookieParts = (value: string, maxAgeSec: number) => {
  const isSecure = runtimeConfig.appEnv !== "local";
  const parts = [
    `${AUTH_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
  ];
  if (isSecure) {
    parts.push("Secure");
  }
  return parts;
};

export const buildSessionSetCookie = (sessionId: string) => {
  return buildCookieParts(encodeURIComponent(sessionId), runtimeConfig.authSessionTtlSec).join(
    "; "
  );
};

export const buildSessionClearCookie = () => {
  return buildCookieParts("", 0).join("; ");
};

export const readSessionIdFromCookieHeader = (cookieHeader: string | undefined) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((item) => item.trim());
  const token = parts.find((item) =>
    item.toLowerCase().startsWith(`${AUTH_SESSION_COOKIE_NAME.toLowerCase()}=`)
  );
  if (!token) return null;
  const [, rawValue = ""] = token.split("=", 2);
  const normalized = rawValue.trim();
  if (!normalized) return null;
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
};
