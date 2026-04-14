import { HttpException, Logger } from "@nestjs/common";
import type { AuthIdentityIntentService } from "../auth/auth.identity-intent.service";
import type { AuthUserDto } from "../auth/auth.types";
import type { ApiRuntimeConfig } from "../config/runtime.config";
import {
  normalizeEmail,
  validateEmailFormat,
} from "./purchases.helpers";
import type {
  CheckoutPayloadDto,
  CheckoutProcessDto,
} from "./purchases.types";

export type CheckoutIdentityContext = {
  email: string;
  identityIntent?: {
    intentId: string;
    channel: string;
    verifiedAt: string | null;
  };
};

export const resolveCheckoutIdentityContext = async (params: {
  payload: CheckoutPayloadDto;
  actorUser: AuthUserDto | null;
  runtimeConfig: ApiRuntimeConfig;
  authIdentityIntentService: AuthIdentityIntentService | null;
}): Promise<CheckoutIdentityContext> => {
  const { actorUser, payload, runtimeConfig, authIdentityIntentService } = params;
  if (actorUser) {
    const email = normalizeEmail(actorUser.email || payload.email);
    if (!email || !validateEmailFormat(email)) {
      throw new HttpException({ error: "Некорректный email для checkout." }, 400);
    }
    return { email };
  }

  if (!runtimeConfig.authPurchaseIdentityIntentGatingEnabled) {
    const email = normalizeEmail(payload.email);
    if (!email || !validateEmailFormat(email)) {
      throw new HttpException({ error: "Некорректный email для checkout." }, 400);
    }
    return { email };
  }

  if (!runtimeConfig.authIdentityIntentsEnabled) {
    throw new HttpException(
      {
        error: "Purchase gating через identity intent временно недоступен.",
        code: "identity_intent_runtime_disabled",
      },
      503
    );
  }
  if (!authIdentityIntentService) {
    throw new HttpException(
      {
        error: "Purchase gating через identity intent временно недоступен.",
        code: "identity_intent_runtime_unavailable",
      },
      503
    );
  }

  const intentId = payload.identityIntentId?.trim() || "";
  if (!intentId) {
    throw new HttpException(
      {
        error: "Для checkout требуется подтвержденный identity intent.",
        code: "identity_intent_required",
      },
      400
    );
  }

  const resolved = await authIdentityIntentService.resolveVerifiedForPurchase(intentId);
  const payloadEmail = normalizeEmail(payload.email);
  if (payloadEmail && payloadEmail !== resolved.email) {
    throw new HttpException(
      {
        error:
          "Подтвержденный identity intent не совпадает с email в checkout payload.",
        code: "identity_intent_context_mismatch",
      },
      409
    );
  }

  return {
    email: resolved.email,
    identityIntent: {
      intentId: resolved.intentId,
      channel: resolved.channel,
      verifiedAt: resolved.verifiedAt,
    },
  };
};

export const buildCheckoutProviderPayload = (params: {
  identityIntentId?: string;
  identityIntentChannel?: string;
  identityIntentVerifiedAt?: string | null;
}): Record<string, unknown> | undefined => {
  const identityIntentId = params.identityIntentId?.trim() || "";
  if (!identityIntentId) {
    return undefined;
  }
  return {
    identityIntentId,
    identityIntentChannel: params.identityIntentChannel ?? "email",
    identityIntentVerifiedAt: params.identityIntentVerifiedAt ?? null,
  };
};

export const extractIdentityIntentIdFromCheckout = (
  checkout: CheckoutProcessDto
): string | null => {
  if (
    !checkout.providerPayload ||
    typeof checkout.providerPayload !== "object" ||
    Array.isArray(checkout.providerPayload)
  ) {
    return null;
  }
  const raw = (checkout.providerPayload as Record<string, unknown>).identityIntentId;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
};

export const consumeIdentityIntentAfterProvision = async (params: {
  checkout: CheckoutProcessDto;
  authIdentityIntentService: AuthIdentityIntentService | null;
  logger: Logger;
}): Promise<void> => {
  const { checkout, authIdentityIntentService, logger } = params;
  const identityIntentId = extractIdentityIntentIdFromCheckout(checkout);
  if (!identityIntentId || !authIdentityIntentService) {
    return;
  }

  try {
    const consumed = await authIdentityIntentService.consume(identityIntentId);
    if (consumed.ok || consumed.state === "consumed" || consumed.state === "expired") {
      return;
    }
    logger.warn(
      `identity_intent consume skipped for checkout=${checkout.id}, intent=${identityIntentId}, state=${consumed.state}`
    );
  } catch (error) {
    logger.warn(
      `identity_intent consume failed for checkout=${checkout.id}, intent=${identityIntentId}: ${
        error instanceof Error ? error.message : "unknown"
      }`
    );
  }
};
