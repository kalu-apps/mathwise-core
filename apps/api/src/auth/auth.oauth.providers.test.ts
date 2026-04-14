import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProviderAuthorizationUrl,
  fetchProviderSocialProfile,
} from "./auth.oauth.providers";

const makeProviderConfig = (overrides?: Partial<{
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
}>) => ({
  enabled: true,
  clientId: overrides?.clientId ?? "client-id",
  clientSecret: overrides?.clientSecret ?? "client-secret",
  authorizeUrl: overrides?.authorizeUrl ?? "https://oauth.vk.ru/authorize",
  tokenUrl: overrides?.tokenUrl ?? "https://oauth.vk.ru/access_token",
  userInfoUrl: overrides?.userInfoUrl ?? "https://api.vk.com/method/users.get",
  scope: overrides?.scope ?? "email",
});

test("oauth providers: vk oauth.vk.ru authorization url keeps PKCE challenge without legacy params", () => {
  const url = buildProviderAuthorizationUrl({
    provider: "vk",
    providerConfig: makeProviderConfig(),
    state: "state-vk-id",
    codeChallenge: "challenge-vk-id",
    redirectUri: "https://stage.mathwise.ru/api/auth/oauth/vk/callback",
  });

  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-vk-id");
  assert.equal(url.searchParams.get("code_challenge_method"), null);
  assert.equal(url.searchParams.get("v"), null);
  assert.equal(url.searchParams.get("display"), null);
});

test("oauth providers: vk oauth.vk.com authorization url keeps legacy params and PKCE method", () => {
  const url = buildProviderAuthorizationUrl({
    provider: "vk",
    providerConfig: makeProviderConfig({
      authorizeUrl: "https://oauth.vk.com/authorize",
      tokenUrl: "https://oauth.vk.com/access_token",
    }),
    state: "state-vk-legacy",
    codeChallenge: "challenge-vk-legacy",
    redirectUri: "https://stage.mathwise.ru/api/auth/oauth/vk/callback",
  });

  assert.equal(url.searchParams.get("code_challenge"), "challenge-vk-legacy");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("v"), "5.199");
  assert.equal(url.searchParams.get("display"), "page");
});

test("oauth providers: token exchange diagnostics surface provider errors", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          error: "invalid_request",
          error_description: "Security Error",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch;

    const result = await fetchProviderSocialProfile({
      provider: "vk",
      providerConfig: makeProviderConfig(),
      code: "oauth-code",
      redirectUri: "https://stage.mathwise.ru/api/auth/oauth/vk/callback",
      codeVerifier: "pkce-verifier",
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected token exchange error for vk provider");
    }
    assert.equal(result.errorCode, "token_exchange_failed");
    assert.equal(result.diagnostics?.stage, "token_exchange");
    assert.equal(result.diagnostics?.httpStatus, 401);
    assert.equal(result.diagnostics?.transport, "form_post");
    assert.equal(result.diagnostics?.providerError, "invalid_request");
    assert.equal(result.diagnostics?.providerErrorDescription, "Security Error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("oauth providers: userinfo diagnostics surface fetch stage metadata", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            access_token: "google-token",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ error: "upstream_unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await fetchProviderSocialProfile({
      provider: "google",
      providerConfig: makeProviderConfig({
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        scope: "openid email profile",
      }),
      code: "oauth-code",
      redirectUri: "https://stage.mathwise.ru/api/auth/oauth/google/callback",
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected userinfo fetch failure for google provider");
    }
    assert.equal(result.errorCode, "provider_profile_failed");
    assert.equal(result.diagnostics?.stage, "userinfo_fetch");
    assert.equal(result.diagnostics?.httpStatus, 503);
    assert.equal(result.diagnostics?.transport, "bearer_get");
    assert.equal(result.diagnostics?.providerError, "upstream_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
