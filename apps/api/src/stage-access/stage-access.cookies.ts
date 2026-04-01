import { getApiRuntimeConfig } from "../config/runtime.config";

const runtimeConfig = getApiRuntimeConfig();

export const STAGE_ACCESS_COOKIE_NAME = runtimeConfig.stageSiteGateCookieName;

const buildCookieParts = (value: string, maxAgeSec: number) => {
  const parts = [
    `${STAGE_ACCESS_COOKIE_NAME}=${value}`,
    `Path=${runtimeConfig.authCookiePath}`,
    `SameSite=${runtimeConfig.authCookieSameSite}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
    "HttpOnly",
  ];
  if (runtimeConfig.authCookieDomain) {
    parts.push(`Domain=${runtimeConfig.authCookieDomain}`);
  }
  if (runtimeConfig.authCookieSecure) {
    parts.push("Secure");
  }
  return parts;
};

export const buildStageAccessSetCookie = (token: string) => {
  return buildCookieParts(
    encodeURIComponent(token),
    runtimeConfig.stageSiteGateTtlSec
  ).join("; ");
};

export const buildStageAccessClearCookie = () => {
  return buildCookieParts("", 0).join("; ");
};

export const readStageAccessTokenFromCookieHeader = (
  cookieHeader: string | undefined
) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((item) => item.trim());
  const token = parts.find((item) =>
    item.toLowerCase().startsWith(`${STAGE_ACCESS_COOKIE_NAME.toLowerCase()}=`)
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

