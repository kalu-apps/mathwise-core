import crypto from "node:crypto";
import type { ApiAuthSocialProviderConfig } from "../config/runtime.config";
import type { RedisService } from "../redis/redis.service";
import type { AuthSocialProvider } from "./auth.types";
import {
  buildProviderAuthorizationUrl,
  fetchProviderSocialProfile,
  type OauthProfileResult,
  type OauthProviderDiagnostics,
} from "./auth.oauth.providers";

export type { OauthProfileResult, OauthProviderDiagnostics };

export const OAUTH_STATE_PREFIX = "auth:oauth:state:";

export type OauthStatePayload = {
  provider: AuthSocialProvider;
  redirectPath: string;
  issuedAt: string;
  codeVerifier?: string;
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
  return buildProviderAuthorizationUrl({
    provider: params.provider,
    providerConfig: params.providerConfig,
    state: params.state,
    codeChallenge: params.codeChallenge,
    redirectUri: getOauthCallbackUrl(params.redirectBaseUrl, params.provider),
  });
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

  return fetchProviderSocialProfile({
    provider: params.provider,
    providerConfig: params.providerConfig,
    code: params.code,
    redirectUri: getOauthCallbackUrl(params.redirectBaseUrl, params.provider),
    codeVerifier: params.codeVerifier,
  });
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
