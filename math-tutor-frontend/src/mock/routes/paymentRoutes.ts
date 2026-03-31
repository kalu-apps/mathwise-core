import type {
  CheckoutProcess,
  PaymentEventProvider,
  PaymentEventStatus,
} from "../../domain/auth-payments/model/types";
import type { MockRequestContext, MockRouteHandler } from "../runtime/requestContext";

type CardWebhookStatus =
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "expired"
  | "refunded"
  | "chargeback";

type WebhookValidationResult =
  | { ok: true; timestampMs: number }
  | { ok: false; status: number; error: string };

type ProcessPaymentEventResult = {
  event: { outcome: string };
  checkout: CheckoutProcess | null;
};

type PaymentRoutesDeps = {
  json: (res: MockRequestContext["res"], status: number, data: unknown) => void;
  readBody: (req: MockRequestContext["req"]) => Promise<unknown>;
  readRawBody: (req: MockRequestContext["req"]) => Promise<string>;
  verifyCardWebhookRequest: (config: {
    secret: string;
    maxSkewSec: number;
    replayTtlSec: number;
  }, input: {
    rawBody: string;
    timestampHeader: string;
    signatureHeader: string;
  }) => WebhookValidationResult;
  webhookSecret: string;
  webhookMaxSkewSec: number;
  webhookReplayTtlSec: number;
  normalizeCardWebhookStatus: (value: unknown) => CardWebhookStatus | null;
  mapCardWebhookToPaymentStatus: (
    status: CardWebhookStatus
  ) => PaymentEventStatus;
  processPaymentEvent: (
    db: MockRequestContext["db"],
    params: {
      provider: PaymentEventProvider;
      externalEventId: string;
      checkoutId: string;
      status: PaymentEventStatus;
      payload: unknown;
      processedAt: string;
    }
  ) => ProcessPaymentEventResult;
  ensureCheckoutProvisioned: (
    db: MockRequestContext["db"],
    checkout: NonNullable<ProcessPaymentEventResult["checkout"]>,
    processedAt: string
  ) => void;
  queueCheckoutTransactionalEmail: (
    db: MockRequestContext["db"],
    checkout: NonNullable<ProcessPaymentEventResult["checkout"]>,
    timestamp?: string
  ) => void;
  revokeCourseAccess: (
    db: MockRequestContext["db"],
    params: {
      userId: string;
      courseId: string;
      notes: string;
    },
    timestamp?: string
  ) => {
    purchasesRemoved: number;
    revokedEntitlements: number;
  };
  logSupportAction: (
    db: MockRequestContext["db"],
    params: {
      type: "refund_and_revoke_course_access";
      issueCode: "refunded_with_access";
      userId: string;
      courseId: string;
      checkoutId: string;
      notes?: string;
    },
    timestamp?: string
  ) => void;
  dispatchOutboxQueue: (
    db: MockRequestContext["db"],
    timestamp?: string
  ) => Promise<number>;
  saveDb: () => void;
  isPaymentEventProvider: (value: unknown) => value is PaymentEventProvider;
  isPaymentEventStatus: (value: unknown) => value is PaymentEventStatus;
  nowIso: () => string;
  getProviderPaymentIdFromPayload: (payload: unknown) => string | undefined;
};

type CardWebhookBody = {
  eventId?: string;
  checkoutId?: string;
  status?: unknown;
  providerPaymentId?: string;
  occurredAt?: string;
  payload?: unknown;
};

export const createPaymentRoutes = (
  deps: PaymentRoutesDeps
): MockRouteHandler => {
  return async ({ path, method, req, res, db, actorUser, url }) => {
    if (path === "/api/payments/providers/card/webhook" && method === "POST") {
      const rawBody = await deps.readRawBody(req);
      const signatureHeader = req.headers["x-card-signature"];
      const timestampHeader = req.headers["x-card-timestamp"];
      const signature = Array.isArray(signatureHeader)
        ? signatureHeader[0] ?? ""
        : signatureHeader ?? "";
      const timestamp = Array.isArray(timestampHeader)
        ? timestampHeader[0] ?? ""
        : timestampHeader ?? "";
      const webhookValidation = deps.verifyCardWebhookRequest(
        {
          secret: deps.webhookSecret,
          maxSkewSec: deps.webhookMaxSkewSec,
          replayTtlSec: deps.webhookReplayTtlSec,
        },
        {
          rawBody,
          timestampHeader: String(timestamp),
          signatureHeader: String(signature),
        }
      );
      if (!webhookValidation.ok) {
        deps.json(res, webhookValidation.status, { error: webhookValidation.error });
        return true;
      }

      let body: CardWebhookBody = {};
      try {
        body = rawBody ? (JSON.parse(rawBody) as CardWebhookBody) : {};
      } catch {
        deps.json(res, 400, { error: "Некорректный JSON webhook." });
        return true;
      }
      const externalEventId =
        typeof body?.eventId === "string" ? body.eventId.trim() : "";
      const checkoutId =
        typeof body?.checkoutId === "string" ? body.checkoutId.trim() : "";
      const webhookStatus = deps.normalizeCardWebhookStatus(body?.status);
      if (!externalEventId || !checkoutId || !webhookStatus) {
        deps.json(res, 400, { error: "Некорректный payload card webhook." });
        return true;
      }
      const processedAt =
        typeof body?.occurredAt === "string" &&
        Number.isFinite(new Date(body.occurredAt).getTime())
          ? body.occurredAt
          : deps.nowIso();
      const paymentStatus = deps.mapCardWebhookToPaymentStatus(webhookStatus);
      const result = deps.processPaymentEvent(db, {
        provider: "card",
        externalEventId,
        checkoutId,
        status: paymentStatus,
        payload: {
          source: "card_webhook",
          providerPaymentId: body?.providerPaymentId ?? null,
          webhookStatus,
          payload: body?.payload ?? null,
        },
        processedAt,
      });
      if (result.checkout) {
        deps.ensureCheckoutProvisioned(db, result.checkout, processedAt);
        if (paymentStatus === "paid") {
          deps.queueCheckoutTransactionalEmail(db, result.checkout, processedAt);
        }
      }

      if (
        (webhookStatus === "refunded" || webhookStatus === "chargeback") &&
        result.checkout?.userId &&
        result.event.outcome !== "duplicate"
      ) {
        const revokeResult = deps.revokeCourseAccess(
          db,
          {
            userId: result.checkout.userId,
            courseId: result.checkout.courseId,
            notes:
              webhookStatus === "refunded"
                ? "Card webhook refund"
                : "Card webhook chargeback",
          },
          processedAt
        );
        deps.logSupportAction(
          db,
          {
            type: "refund_and_revoke_course_access",
            issueCode: "refunded_with_access",
            userId: result.checkout.userId,
            courseId: result.checkout.courseId,
            checkoutId: result.checkout.id,
            notes: `${webhookStatus}; purchasesRemoved=${revokeResult.purchasesRemoved}; revokedEntitlements=${revokeResult.revokedEntitlements}`,
          },
          processedAt
        );
      }

      await deps.dispatchOutboxQueue(db, processedAt);
      deps.saveDb();
      deps.json(res, 200, {
        ok: true,
        event: result.event,
        checkout: result.checkout,
      });
      return true;
    }

    if (path === "/api/payments/events" && method === "POST") {
      if (!actorUser || actorUser.role !== "teacher") {
        deps.json(res, 403, {
          error: "Операция доступна только преподавателю.",
        });
        return true;
      }
      const body = (await deps.readBody(req)) as {
        provider: PaymentEventProvider;
        externalEventId: string;
        checkoutId: string;
        status: PaymentEventStatus;
        payload?: unknown;
      };
      if (
        !deps.isPaymentEventProvider(body?.provider) ||
        typeof body?.externalEventId !== "string" ||
        !body.externalEventId.trim() ||
        typeof body?.checkoutId !== "string" ||
        !body.checkoutId.trim() ||
        !deps.isPaymentEventStatus(body?.status)
      ) {
        deps.json(res, 400, { error: "Некорректный payload события оплаты." });
        return true;
      }
      const timestamp = deps.nowIso();
      const result = deps.processPaymentEvent(db, {
        provider: body.provider,
        externalEventId: body.externalEventId.trim(),
        checkoutId: body.checkoutId.trim(),
        status: body.status,
        payload: body.payload,
        processedAt: timestamp,
      });
      if (result.checkout) {
        deps.ensureCheckoutProvisioned(db, result.checkout, timestamp);
        deps.queueCheckoutTransactionalEmail(db, result.checkout, timestamp);
      }
      await deps.dispatchOutboxQueue(db, timestamp);
      deps.saveDb();
      deps.json(res, 200, result);
      return true;
    }

    if (path === "/api/payments/events" && method === "GET") {
      if (!actorUser || actorUser.role !== "teacher") {
        deps.json(res, 403, {
          error: "Операция доступна только преподавателю.",
        });
        return true;
      }
      const checkoutId = decodeURIComponent(url.searchParams.get("checkoutId") ?? "");
      const provider = decodeURIComponent(url.searchParams.get("provider") ?? "");
      let events = db.paymentEvents;
      if (checkoutId) {
        events = events.filter((event) => event.checkoutId === checkoutId);
      }
      if (provider) {
        events = events.filter((event) => event.provider === provider);
      }
      deps.json(
        res,
        200,
        [...events].sort((a, b) => b.processedAt.localeCompare(a.processedAt))
      );
      return true;
    }

    if (path === "/api/payments/providers/card/refund" && method === "POST") {
      if (!actorUser || actorUser.role !== "teacher") {
        deps.json(res, 403, {
          error: "Операция доступна только преподавателю.",
        });
        return true;
      }
      const body = (await deps.readBody(req)) as {
        checkoutId?: string;
        reason?: string;
      };
      const checkoutId =
        typeof body?.checkoutId === "string" ? body.checkoutId.trim() : "";
      if (!checkoutId) {
        deps.json(res, 400, { error: "checkoutId обязателен." });
        return true;
      }
      const checkout =
        db.checkoutProcesses.find((item) => item.id === checkoutId) ?? null;
      if (!checkout) {
        deps.json(res, 404, { error: "Checkout не найден." });
        return true;
      }
      const timestamp = deps.nowIso();
      const providerPaymentId = db.paymentEvents
        .filter(
          (event) => event.provider === "card" && event.checkoutId === checkoutId
        )
        .map((event) => {
          if (!event.payload) return undefined;
          try {
            const payload = JSON.parse(event.payload) as Record<string, unknown>;
            return deps.getProviderPaymentIdFromPayload(payload);
          } catch {
            return undefined;
          }
        })
        .find(Boolean);
      const result = deps.processPaymentEvent(db, {
        provider: "card",
        externalEventId: `card:refund:${checkout.id}:${timestamp}`,
        checkoutId: checkout.id,
        status: "canceled",
        payload: {
          source: "card_refund_api",
          reason: typeof body?.reason === "string" ? body.reason.trim() : "",
          providerPaymentId: providerPaymentId ?? null,
        },
        processedAt: timestamp,
      });
      let revokeResult: ReturnType<PaymentRoutesDeps["revokeCourseAccess"]> | null = null;
      if (checkout.userId) {
        revokeResult = deps.revokeCourseAccess(
          db,
          {
            userId: checkout.userId,
            courseId: checkout.courseId,
            notes: "Card refund API",
          },
          timestamp
        );
        deps.logSupportAction(
          db,
          {
            type: "refund_and_revoke_course_access",
            issueCode: "refunded_with_access",
            userId: checkout.userId,
            courseId: checkout.courseId,
            checkoutId: checkout.id,
            notes: `card_refund_api; purchasesRemoved=${revokeResult.purchasesRemoved}; revokedEntitlements=${revokeResult.revokedEntitlements}`,
          },
          timestamp
        );
      }
      deps.saveDb();
      deps.json(res, 200, {
        ok: true,
        event: result.event,
        checkout,
        revokeResult,
      });
      return true;
    }

    return false;
  };
};
