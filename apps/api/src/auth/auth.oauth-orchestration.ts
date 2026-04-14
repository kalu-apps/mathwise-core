import crypto from "node:crypto";
import type { ApiAuthSocialProviderConfig } from "../config/runtime.config";
import type { RedisService } from "../redis/redis.service";
import type { AuthSocialProfile, AuthSocialProvider } from "./auth.types";

export const OAUTH_STATE_PREFIX = "auth:oauth:state:";

export type OauthStatePayload = {
  provider: AuthSocialProvider;
  redirectPath: string;
  issuedAt: string;
  codeVerifier?: string;
};

export type OauthProfileResult =
  | { ok: true; profile: AuthSocialProfile }
  | {
      ok: false;
      errorCode:
        | "provider_misconfigured"
        | "token_exchange_failed"
        | "provider_profile_failed"
        | "email_missing"
        | "email_not_verified"
        | "profile_invalid";
    };

export const SOCIAL_PROVIDERS: AuthSocialProvider[] = ["google", "yandex", "vk"];

export const parseSocialProvider = (value: string): AuthSocialProvider | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "google" || normalized === "yandex" || normalized === "vk") {
    return normalized;
  }
  return null;
};

export const sanitizeClientRedirectPath = (raw: string | undefined): string => {
  const candidate = (raw ?? "").trim();
  if (!candidate) return "/";
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    return "/";
  }
  if (candidate.startsWith("//")) return "/";
  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("/api/")) return "/";
  return candidate;
};

export const buildClientRedirectUrl = (
  baseOrigin: string,
  params: {
    redirectPath: string;
    provider?: AuthSocialProvider;
    errorCode?: string;
  }
): string => {
  const redirectPath = sanitizeClientRedirectPath(params.redirectPath);
  const target = new URL(redirectPath, `${baseOrigin}/`);
  if (params.provider) {
    target.searchParams.set("authSocialProvider", params.provider);
  }
  if (params.errorCode) {
    target.searchParams.set("authSocialError", params.errorCode);
  } else {
    target.searchParams.delete("authSocialError");
    target.searchParams.delete("authSocialProvider");
  }
  return target.toString();
};

export const getOauthCallbackUrl = (
  baseOrigin: string,
  provider: AuthSocialProvider
): string => `${baseOrigin}/api/auth/oauth/${provider}/callback`;

export const buildAuthorizationUrl = (params: {
  provider: AuthSocialProvider;
  providerConfig: ApiAuthSocialProviderConfig;
  state: string;
  codeChallenge?: string;
  redirectBaseUrl: string;
}): URL => {
  const redirectUri = getOauthCallbackUrl(params.redirectBaseUrl, params.provider);
  const authUrl = new URL(params.providerConfig.authorizeUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", params.providerConfig.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", params.providerConfig.scope);
  authUrl.searchParams.set("state", params.state);

  if (params.provider === "google") {
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("prompt", "select_account");
  }
  if (params.provider === "vk") {
    const vkHost = authUrl.hostname.toLowerCase();
    if (params.codeChallenge) {
      authUrl.searchParams.set("code_challenge", params.codeChallenge);
      // oauth.vk.ru currently rejects explicit code_challenge_method values.
      // Keep PKCE challenge and rely on provider default handling.
      if (vkHost === "oauth.vk.com") {
        authUrl.searchParams.set("code_challenge_method", "S256");
      }
    }
    // Legacy oauth.vk.com uses versioned API semantics, oauth.vk.ru does not.
    if (vkHost === "oauth.vk.com") {
      authUrl.searchParams.set("v", "5.199");
      authUrl.searchParams.set("display", "page");
    }
  }
  return authUrl;
};

export const consumeOauthState = async (params: {
  redisService: RedisService;
  state: string;
}): Promise<OauthStatePayload | null> => {
  const key = `${OAUTH_STATE_PREFIX}${params.state}`;
  const raw = await params.redisService.get(key);
  await params.redisService.del(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OauthStatePayload;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.provider !== "string" ||
      typeof parsed.redirectPath !== "string" ||
      typeof parsed.issuedAt !== "string"
    ) {
      return null;
    }
    const provider = parseSocialProvider(parsed.provider);
    if (!provider) return null;
    return {
      provider,
      redirectPath: sanitizeClientRedirectPath(parsed.redirectPath),
      issuedAt: parsed.issuedAt,
      codeVerifier:
        typeof parsed.codeVerifier === "string" && parsed.codeVerifier.trim().length > 0
          ? parsed.codeVerifier.trim()
          : undefined,
    };
  } catch {
    return null;
  }
};

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const readString = (payload: unknown, key: string): string => {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
};

const readBoolean = (payload: unknown, key: string): boolean => {
  if (!payload || typeof payload !== "object") return false;
  const value = (payload as Record<string, unknown>)[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") return value === 1;
  return false;
};

const readArray = (payload: unknown, key: string): unknown[] => {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
};

const readStringArray = (payload: unknown, key: string): string[] => {
  return readArray(payload, key).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
};

const fetchGoogleProfile = async (params: {
  providerConfig: ApiAuthSocialProviderConfig;
  code: string;
  redirectBaseUrl: string;
}): Promise<OauthProfileResult> => {
  const redirectUri = getOauthCallbackUrl(params.redirectBaseUrl, "google");
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.providerConfig.clientId,
    client_secret: params.providerConfig.clientSecret,
    redirect_uri: redirectUri,
    code: params.code,
  });
  const tokenResponse = await fetch(params.providerConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody.toString(),
  });
  const tokenPayload = await parseJsonResponse(tokenResponse);
  const token = readString(tokenPayload, "access_token");
  if (!tokenResponse.ok || !token) {
    return { ok: false, errorCode: "token_exchange_failed" };
  }

  const profileResponse = await fetch(params.providerConfig.userInfoUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const profilePayload = await parseJsonResponse(profileResponse);
  if (!profileResponse.ok) {
    return { ok: false, errorCode: "provider_profile_failed" };
  }
  const providerUserId = readString(profilePayload, "sub");
  const email = readString(profilePayload, "email");
  const emailVerified = readBoolean(profilePayload, "email_verified");
  if (!providerUserId) {
    return { ok: false, errorCode: "profile_invalid" };
  }
  if (!email) {
    return { ok: false, errorCode: "email_missing" };
  }

  return {
    ok: true,
    profile: {
      provider: "google",
      providerUserId,
      email,
      emailVerified,
      firstName: readString(profilePayload, "given_name") || undefined,
      lastName: readString(profilePayload, "family_name") || undefined,
      photo: readString(profilePayload, "picture") || undefined,
    },
  };
};

const fetchYandexProfile = async (params: {
  providerConfig: ApiAuthSocialProviderConfig;
  code: string;
  redirectBaseUrl: string;
}): Promise<OauthProfileResult> => {
  const redirectUri = getOauthCallbackUrl(params.redirectBaseUrl, "yandex");
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.providerConfig.clientId,
    client_secret: params.providerConfig.clientSecret,
    redirect_uri: redirectUri,
    code: params.code,
  });
  const tokenResponse = await fetch(params.providerConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody.toString(),
  });
  const tokenPayload = await parseJsonResponse(tokenResponse);
  const token = readString(tokenPayload, "access_token");
  if (!tokenResponse.ok || !token) {
    return { ok: false, errorCode: "token_exchange_failed" };
  }

  const profileUrl = new URL(params.providerConfig.userInfoUrl);
  if (!profileUrl.searchParams.has("format")) {
    profileUrl.searchParams.set("format", "json");
  }
  const profileResponse = await fetch(profileUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `OAuth ${token}`,
    },
  });
  const profilePayload = await parseJsonResponse(profileResponse);
  if (!profileResponse.ok) {
    return { ok: false, errorCode: "provider_profile_failed" };
  }
  const providerUserId = readString(profilePayload, "id");
  const defaultEmail = readString(profilePayload, "default_email");
  const emails = readStringArray(profilePayload, "emails");
  const email = defaultEmail || emails[0] || "";
  if (!providerUserId) {
    return { ok: false, errorCode: "profile_invalid" };
  }
  if (!email) {
    return { ok: false, errorCode: "email_missing" };
  }

  return {
    ok: true,
    profile: {
      provider: "yandex",
      providerUserId,
      email,
      emailVerified: true,
      firstName: readString(profilePayload, "first_name") || undefined,
      lastName: readString(profilePayload, "last_name") || undefined,
    },
  };
};

const fetchVkProfile = async (params: {
  providerConfig: ApiAuthSocialProviderConfig;
  code: string;
  redirectBaseUrl: string;
  codeVerifier?: string;
}): Promise<OauthProfileResult> => {
  const redirectUri = getOauthCallbackUrl(params.redirectBaseUrl, "vk");
  const tokenUrl = new URL(params.providerConfig.tokenUrl);
  const isVkIdOauth = tokenUrl.hostname.toLowerCase() === "oauth.vk.ru";
  let tokenResponse: Response;

  if (isVkIdOauth) {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: params.providerConfig.clientId,
      client_secret: params.providerConfig.clientSecret,
      redirect_uri: redirectUri,
      code: params.code,
    });
    if (params.codeVerifier) {
      tokenBody.set("code_verifier", params.codeVerifier);
    }
    tokenResponse = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });
  } else {
    tokenUrl.searchParams.set("client_id", params.providerConfig.clientId);
    tokenUrl.searchParams.set("client_secret", params.providerConfig.clientSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", params.code);
    tokenUrl.searchParams.set("v", "5.199");
    if (params.codeVerifier) {
      tokenUrl.searchParams.set("code_verifier", params.codeVerifier);
    }
    tokenResponse = await fetch(tokenUrl.toString(), {
      method: "GET",
    });
  }

  const tokenPayload = await parseJsonResponse(tokenResponse);
  if (!tokenResponse.ok) {
    return { ok: false, errorCode: "token_exchange_failed" };
  }
  const token = readString(tokenPayload, "access_token");
  const userId = readString(tokenPayload, "user_id");
  const email = readString(tokenPayload, "email");
  if (!token || !userId) {
    return { ok: false, errorCode: "token_exchange_failed" };
  }
  if (!email) {
    return { ok: false, errorCode: "email_missing" };
  }

  const profileUrl = new URL(params.providerConfig.userInfoUrl);
  profileUrl.searchParams.set("access_token", token);
  profileUrl.searchParams.set("v", "5.199");
  profileUrl.searchParams.set("user_ids", userId);
  profileUrl.searchParams.set("fields", "photo_200");

  const profileResponse = await fetch(profileUrl.toString(), {
    method: "GET",
  });
  const profilePayload = await parseJsonResponse(profileResponse);
  if (!profileResponse.ok) {
    return { ok: false, errorCode: "provider_profile_failed" };
  }
  const responseList = readArray(profilePayload, "response");
  const firstProfile =
    responseList.length > 0 && typeof responseList[0] === "object"
      ? (responseList[0] as Record<string, unknown>)
      : null;
  const firstName = firstProfile
    ? readString(firstProfile, "first_name") || undefined
    : undefined;
  const lastName = firstProfile
    ? readString(firstProfile, "last_name") || undefined
    : undefined;
  const photo = firstProfile
    ? readString(firstProfile, "photo_200") || undefined
    : undefined;

  return {
    ok: true,
    profile: {
      provider: "vk",
      providerUserId: userId,
      email,
      emailVerified: true,
      firstName,
      lastName,
      photo,
    },
  };
};

export const fetchSocialProfile = async (params: {
  provider: AuthSocialProvider;
  providerConfig: ApiAuthSocialProviderConfig;
  code: string;
  redirectBaseUrl: string;
  codeVerifier?: string;
}): Promise<OauthProfileResult> => {
  if (!params.providerConfig.clientId || !params.providerConfig.clientSecret) {
    return { ok: false, errorCode: "provider_misconfigured" };
  }

  try {
    if (params.provider === "google") {
      return await fetchGoogleProfile({
        providerConfig: params.providerConfig,
        code: params.code,
        redirectBaseUrl: params.redirectBaseUrl,
      });
    }
    if (params.provider === "yandex") {
      return await fetchYandexProfile({
        providerConfig: params.providerConfig,
        code: params.code,
        redirectBaseUrl: params.redirectBaseUrl,
      });
    }
    return await fetchVkProfile({
      providerConfig: params.providerConfig,
      code: params.code,
      redirectBaseUrl: params.redirectBaseUrl,
      codeVerifier: params.codeVerifier,
    });
  } catch {
    return { ok: false, errorCode: "provider_profile_failed" };
  }
};

export const generatePkceCodeVerifier = (): string => {
  return crypto.randomBytes(48).toString("base64url");
};

export const buildPkceCodeChallenge = (codeVerifier: string): string => {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
};

export const fingerprint = (value: string): string => {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
};
