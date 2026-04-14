import type { ApiAuthSocialProviderConfig } from "../config/runtime.config";
import type { AuthSocialProfile, AuthSocialProvider } from "./auth.types";

export type OauthProviderDiagnostics = {
  stage: "token_exchange" | "userinfo_fetch" | "profile_normalization";
  httpStatus?: number;
  providerError?: string;
  providerErrorDescription?: string;
  transport?: "form_post" | "query_get" | "bearer_get" | "oauth_header_get";
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
      diagnostics?: OauthProviderDiagnostics;
    };

type BuildProviderAuthorizationUrlParams = {
  provider: AuthSocialProvider;
  providerConfig: ApiAuthSocialProviderConfig;
  state: string;
  codeChallenge?: string;
  redirectUri: string;
};

type FetchProviderSocialProfileParams = {
  provider: AuthSocialProvider;
  providerConfig: ApiAuthSocialProviderConfig;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
};

type OauthTokenResult =
  | {
      ok: true;
      accessToken: string;
      providerUserId?: string;
      email?: string;
    }
  | {
      ok: false;
      errorCode: "token_exchange_failed" | "email_missing";
      diagnostics: OauthProviderDiagnostics;
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

const extractProviderErrorDetails = (payload: unknown): {
  providerError?: string;
  providerErrorDescription?: string;
} => {
  const providerError =
    readString(payload, "error") || readString(payload, "error_code") || undefined;
  const providerErrorDescription =
    readString(payload, "error_description") ||
    readString(payload, "error_msg") ||
    undefined;

  return {
    providerError,
    providerErrorDescription,
  };
};

const isVkLegacyOauthHost = (urlValue: string): boolean => {
  try {
    return new URL(urlValue).hostname.toLowerCase() === "oauth.vk.com";
  } catch {
    return false;
  }
};

export const buildProviderAuthorizationUrl = (
  params: BuildProviderAuthorizationUrlParams
): URL => {
  const authUrl = new URL(params.providerConfig.authorizeUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", params.providerConfig.clientId);
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("scope", params.providerConfig.scope);
  authUrl.searchParams.set("state", params.state);

  if (params.provider === "google") {
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("prompt", "select_account");
  }

  if (params.provider === "vk") {
    const vkLegacyOauth = isVkLegacyOauthHost(params.providerConfig.authorizeUrl);
    if (params.codeChallenge) {
      authUrl.searchParams.set("code_challenge", params.codeChallenge);
      if (vkLegacyOauth) {
        authUrl.searchParams.set("code_challenge_method", "S256");
      }
    }
    if (vkLegacyOauth) {
      authUrl.searchParams.set("v", "5.199");
      authUrl.searchParams.set("display", "page");
    }
  }

  return authUrl;
};

const exchangeGoogleToken = async (
  params: FetchProviderSocialProfileParams
): Promise<OauthTokenResult> => {
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.providerConfig.clientId,
    client_secret: params.providerConfig.clientSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
  });

  const response = await fetch(params.providerConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody.toString(),
  });

  const payload = await parseJsonResponse(response);
  const accessToken = readString(payload, "access_token");
  if (!response.ok || !accessToken) {
    return {
      ok: false,
      errorCode: "token_exchange_failed",
      diagnostics: {
        stage: "token_exchange",
        httpStatus: response.status,
        transport: "form_post",
        ...extractProviderErrorDetails(payload),
      },
    };
  }

  return {
    ok: true,
    accessToken,
  };
};

const exchangeYandexToken = async (
  params: FetchProviderSocialProfileParams
): Promise<OauthTokenResult> => {
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.providerConfig.clientId,
    client_secret: params.providerConfig.clientSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
  });

  const response = await fetch(params.providerConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody.toString(),
  });

  const payload = await parseJsonResponse(response);
  const accessToken = readString(payload, "access_token");
  if (!response.ok || !accessToken) {
    return {
      ok: false,
      errorCode: "token_exchange_failed",
      diagnostics: {
        stage: "token_exchange",
        httpStatus: response.status,
        transport: "form_post",
        ...extractProviderErrorDetails(payload),
      },
    };
  }

  return {
    ok: true,
    accessToken,
  };
};

const exchangeVkToken = async (
  params: FetchProviderSocialProfileParams
): Promise<OauthTokenResult> => {
  const tokenUrl = new URL(params.providerConfig.tokenUrl);
  const vkIdOauth = tokenUrl.hostname.toLowerCase() === "oauth.vk.ru";
  const transport: OauthProviderDiagnostics["transport"] = vkIdOauth
    ? "form_post"
    : "query_get";

  let response: Response;
  if (vkIdOauth) {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: params.providerConfig.clientId,
      client_secret: params.providerConfig.clientSecret,
      redirect_uri: params.redirectUri,
      code: params.code,
    });
    if (params.codeVerifier) {
      tokenBody.set("code_verifier", params.codeVerifier);
    }
    response = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });
  } else {
    tokenUrl.searchParams.set("client_id", params.providerConfig.clientId);
    tokenUrl.searchParams.set("client_secret", params.providerConfig.clientSecret);
    tokenUrl.searchParams.set("redirect_uri", params.redirectUri);
    tokenUrl.searchParams.set("code", params.code);
    tokenUrl.searchParams.set("v", "5.199");
    if (params.codeVerifier) {
      tokenUrl.searchParams.set("code_verifier", params.codeVerifier);
    }
    response = await fetch(tokenUrl.toString(), {
      method: "GET",
    });
  }

  const payload = await parseJsonResponse(response);
  const accessToken = readString(payload, "access_token");
  const providerUserId = readString(payload, "user_id");
  const email = readString(payload, "email");

  if (!response.ok || !accessToken || !providerUserId) {
    return {
      ok: false,
      errorCode: "token_exchange_failed",
      diagnostics: {
        stage: "token_exchange",
        httpStatus: response.status,
        transport,
        ...extractProviderErrorDetails(payload),
      },
    };
  }

  if (!email) {
    return {
      ok: false,
      errorCode: "email_missing",
      diagnostics: {
        stage: "token_exchange",
        httpStatus: response.status,
        transport,
      },
    };
  }

  return {
    ok: true,
    accessToken,
    providerUserId,
    email,
  };
};

const exchangeProviderToken = async (
  params: FetchProviderSocialProfileParams
): Promise<OauthTokenResult> => {
  if (params.provider === "google") {
    return exchangeGoogleToken(params);
  }
  if (params.provider === "yandex") {
    return exchangeYandexToken(params);
  }
  return exchangeVkToken(params);
};

const buildGoogleProfile = (payload: unknown): OauthProfileResult => {
  const providerUserId = readString(payload, "sub");
  const email = readString(payload, "email");
  const emailVerified = readBoolean(payload, "email_verified");

  if (!providerUserId) {
    return { ok: false, errorCode: "profile_invalid", diagnostics: { stage: "profile_normalization" } };
  }
  if (!email) {
    return { ok: false, errorCode: "email_missing", diagnostics: { stage: "profile_normalization" } };
  }

  return {
    ok: true,
    profile: {
      provider: "google",
      providerUserId,
      email,
      emailVerified,
      firstName: readString(payload, "given_name") || undefined,
      lastName: readString(payload, "family_name") || undefined,
      photo: readString(payload, "picture") || undefined,
    },
  };
};

const buildYandexProfile = (payload: unknown): OauthProfileResult => {
  const providerUserId = readString(payload, "id");
  const defaultEmail = readString(payload, "default_email");
  const emails = readStringArray(payload, "emails");
  const email = defaultEmail || emails[0] || "";

  if (!providerUserId) {
    return { ok: false, errorCode: "profile_invalid", diagnostics: { stage: "profile_normalization" } };
  }
  if (!email) {
    return { ok: false, errorCode: "email_missing", diagnostics: { stage: "profile_normalization" } };
  }

  return {
    ok: true,
    profile: {
      provider: "yandex",
      providerUserId,
      email,
      emailVerified: true,
      firstName: readString(payload, "first_name") || undefined,
      lastName: readString(payload, "last_name") || undefined,
    },
  };
};

const buildVkProfile = (params: {
  payload: unknown;
  providerUserId: string;
  email: string;
}): OauthProfileResult => {
  const responseList = readArray(params.payload, "response");
  const firstProfile =
    responseList.length > 0 && typeof responseList[0] === "object"
      ? (responseList[0] as Record<string, unknown>)
      : null;

  return {
    ok: true,
    profile: {
      provider: "vk",
      providerUserId: params.providerUserId,
      email: params.email,
      emailVerified: true,
      firstName: firstProfile ? readString(firstProfile, "first_name") || undefined : undefined,
      lastName: firstProfile ? readString(firstProfile, "last_name") || undefined : undefined,
      photo: firstProfile ? readString(firstProfile, "photo_200") || undefined : undefined,
    },
  };
};

const fetchGoogleUserInfo = async (accessToken: string, userInfoUrl: string) => {
  const response = await fetch(userInfoUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await parseJsonResponse(response);
  return {
    response,
    payload,
    transport: "bearer_get" as const,
  };
};

const fetchYandexUserInfo = async (accessToken: string, userInfoUrl: string) => {
  const profileUrl = new URL(userInfoUrl);
  if (!profileUrl.searchParams.has("format")) {
    profileUrl.searchParams.set("format", "json");
  }
  const response = await fetch(profileUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `OAuth ${accessToken}`,
    },
  });
  const payload = await parseJsonResponse(response);
  return {
    response,
    payload,
    transport: "oauth_header_get" as const,
  };
};

const fetchVkUserInfo = async (params: {
  accessToken: string;
  providerUserId: string;
  userInfoUrl: string;
}) => {
  const profileUrl = new URL(params.userInfoUrl);
  profileUrl.searchParams.set("access_token", params.accessToken);
  profileUrl.searchParams.set("v", "5.199");
  profileUrl.searchParams.set("user_ids", params.providerUserId);
  profileUrl.searchParams.set("fields", "photo_200");

  const response = await fetch(profileUrl.toString(), {
    method: "GET",
  });
  const payload = await parseJsonResponse(response);
  return {
    response,
    payload,
    transport: "query_get" as const,
  };
};

const fetchProviderUserInfo = async (params: {
  provider: AuthSocialProvider;
  accessToken: string;
  userInfoUrl: string;
  providerUserId?: string;
}) => {
  if (params.provider === "google") {
    return fetchGoogleUserInfo(params.accessToken, params.userInfoUrl);
  }
  if (params.provider === "yandex") {
    return fetchYandexUserInfo(params.accessToken, params.userInfoUrl);
  }

  return fetchVkUserInfo({
    accessToken: params.accessToken,
    providerUserId: params.providerUserId ?? "",
    userInfoUrl: params.userInfoUrl,
  });
};

export const fetchProviderSocialProfile = async (
  params: FetchProviderSocialProfileParams
): Promise<OauthProfileResult> => {
  if (!params.providerConfig.clientId || !params.providerConfig.clientSecret) {
    return { ok: false, errorCode: "provider_misconfigured" };
  }

  try {
    const tokenResult = await exchangeProviderToken(params);
    if (!tokenResult.ok) {
      return {
        ok: false,
        errorCode: tokenResult.errorCode,
        diagnostics: tokenResult.diagnostics,
      };
    }

    const userInfoResult = await fetchProviderUserInfo({
      provider: params.provider,
      accessToken: tokenResult.accessToken,
      userInfoUrl: params.providerConfig.userInfoUrl,
      providerUserId: tokenResult.providerUserId,
    });

    if (!userInfoResult.response.ok) {
      return {
        ok: false,
        errorCode: "provider_profile_failed",
        diagnostics: {
          stage: "userinfo_fetch",
          httpStatus: userInfoResult.response.status,
          transport: userInfoResult.transport,
          ...extractProviderErrorDetails(userInfoResult.payload),
        },
      };
    }

    if (params.provider === "google") {
      return buildGoogleProfile(userInfoResult.payload);
    }
    if (params.provider === "yandex") {
      return buildYandexProfile(userInfoResult.payload);
    }

    return buildVkProfile({
      payload: userInfoResult.payload,
      providerUserId: tokenResult.providerUserId ?? "",
      email: tokenResult.email ?? "",
    });
  } catch {
    return {
      ok: false,
      errorCode: "provider_profile_failed",
      diagnostics: {
        stage: "userinfo_fetch",
      },
    };
  }
};
