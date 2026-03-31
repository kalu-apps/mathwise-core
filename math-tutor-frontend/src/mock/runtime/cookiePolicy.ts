import type { AuthCookieSameSite } from "./serverEnv";

export type AuthCookiePolicy = {
  secure: boolean;
  httpOnly: boolean;
  sameSite: AuthCookieSameSite;
  domain?: string;
  path: string;
  maxAgeSec: number;
};

const appendIf = (target: string[], value: string | null) => {
  if (!value) return;
  target.push(value);
};

const serializeBaseCookie = (
  name: string,
  value: string,
  policy: AuthCookiePolicy,
  overrides?: {
    maxAgeSec?: number;
    expires?: Date;
  }
) => {
  const parts: string[] = [];
  parts.push(`${name}=${value}`);
  parts.push(`Path=${policy.path}`);
  parts.push(`SameSite=${policy.sameSite}`);
  appendIf(parts, policy.domain ? `Domain=${policy.domain}` : null);
  appendIf(parts, policy.httpOnly ? "HttpOnly" : null);
  appendIf(parts, policy.secure ? "Secure" : null);

  const maxAgeSec = overrides?.maxAgeSec ?? policy.maxAgeSec;
  if (Number.isFinite(maxAgeSec)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  }
  if (overrides?.expires) {
    parts.push(`Expires=${overrides.expires.toUTCString()}`);
  }

  return parts.join("; ");
};

export const buildSessionSetCookie = (
  cookieName: string,
  sessionId: string,
  policy: AuthCookiePolicy
) =>
  serializeBaseCookie(cookieName, encodeURIComponent(sessionId), policy, {
    maxAgeSec: policy.maxAgeSec,
  });

export const buildSessionClearCookie = (
  cookieName: string,
  policy: AuthCookiePolicy
) =>
  serializeBaseCookie(cookieName, "", policy, {
    maxAgeSec: 0,
    expires: new Date(0),
  });
