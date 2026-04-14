import crypto from "node:crypto";
import { HttpException, Injectable } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";
import {
  STAGE_RUNTIME_MARKER,
  isStageSiteGateRuntimeEnabled,
} from "../config/runtime.governance";
import {
  buildStageAccessClearCookie,
  buildStageAccessSetCookie,
  readStageAccessTokenFromCookieHeader,
} from "./stage-access.cookies";
import type {
  StageAccessStatusDto,
  StageAccessVerifyResponseDto,
} from "./stage-access.types";

type StageTokenPayload = {
  v: 1;
  iat: number;
  exp: number;
  marker: typeof STAGE_RUNTIME_MARKER;
};

const nowMs = () => Date.now();

const toBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const withPadding =
    padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return Buffer.from(withPadding, "base64").toString("utf8");
};

const timingSafeEquals = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

@Injectable()
export class StageAccessService {
  private readonly runtimeConfig = getApiRuntimeConfig();

  isEnabled() {
    return isStageSiteGateRuntimeEnabled(this.runtimeConfig);
  }

  getStatus(cookieHeader: string | undefined): StageAccessStatusDto {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        granted: true,
        expiresAt: null,
        marker: STAGE_RUNTIME_MARKER,
      };
    }

    const parsed = this.parseTokenFromCookie(cookieHeader);
    if (!parsed) {
      return {
        enabled: true,
        granted: false,
        expiresAt: null,
        marker: STAGE_RUNTIME_MARKER,
      };
    }

    return {
      enabled: true,
      granted: true,
      expiresAt: new Date(parsed.exp).toISOString(),
      marker: STAGE_RUNTIME_MARKER,
    };
  }

  verify(secret: string): { response: StageAccessVerifyResponseDto; setCookie: string } {
    this.assertEnabled();
    const normalizedSecret = secret.trim();
    if (!normalizedSecret) {
      throw new HttpException(
        { error: "Stage access secret обязателен.", code: "stage_access_invalid_secret" },
        400
      );
    }
    if (!timingSafeEquals(normalizedSecret, this.runtimeConfig.stageSiteGateSecret)) {
      throw new HttpException(
        {
          error: "Неверный stage access secret.",
          code: "stage_access_invalid_secret",
        },
        401
      );
    }

    const token = this.createToken();
    return {
      response: {
        ok: true,
        enabled: true,
        granted: true,
        expiresAt: new Date(token.exp).toISOString(),
        marker: STAGE_RUNTIME_MARKER,
      },
      setCookie: buildStageAccessSetCookie(token.value),
    };
  }

  buildLogoutPayload(): { response: StageAccessVerifyResponseDto; clearCookie: string } {
    this.assertEnabled();
    return {
      response: {
        ok: true,
        enabled: true,
        granted: false,
        expiresAt: null,
        marker: STAGE_RUNTIME_MARKER,
      },
      clearCookie: buildStageAccessClearCookie(),
    };
  }

  private assertEnabled() {
    if (!this.isEnabled()) {
      throw new HttpException(
        {
          error: "Stage access gate отключен в текущем runtime.",
          code: "stage_access_disabled",
        },
        404
      );
    }
  }

  private parseTokenFromCookie(cookieHeader: string | undefined): StageTokenPayload | null {
    const raw = readStageAccessTokenFromCookieHeader(cookieHeader);
    if (!raw) return null;
    return this.parseToken(raw);
  }

  private parseToken(token: string): StageTokenPayload | null {
    const [encodedPayload, signature] = token.split(".", 2);
    if (!encodedPayload || !signature) return null;
    const expectedSignature = this.signPayload(encodedPayload);
    if (!timingSafeEquals(signature, expectedSignature)) return null;

    let payload: StageTokenPayload;
    try {
      payload = JSON.parse(fromBase64Url(encodedPayload)) as StageTokenPayload;
    } catch {
      return null;
    }

    if (
      payload?.v !== 1 ||
      payload.marker !== STAGE_RUNTIME_MARKER ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }
    if (payload.exp <= nowMs()) return null;
    return payload;
  }

  private createToken(): { value: string; exp: number } {
    const iat = nowMs();
    const exp = iat + this.runtimeConfig.stageSiteGateTtlSec * 1000;
    const payload: StageTokenPayload = {
      v: 1,
      iat,
      exp,
      marker: STAGE_RUNTIME_MARKER,
    };
    const encoded = toBase64Url(JSON.stringify(payload));
    const signature = this.signPayload(encoded);
    return {
      value: `${encoded}.${signature}`,
      exp,
    };
  }

  private signPayload(encodedPayload: string) {
    return crypto
      .createHmac("sha256", this.runtimeConfig.stageSiteGateSecret)
      .update(encodedPayload)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
}
