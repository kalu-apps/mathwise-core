import type { MockRequestContext, MockRouteHandler } from "../runtime/requestContext";

type RuntimeRoutesDeps = {
  json: (res: MockRequestContext["res"], status: number, data: unknown) => void;
  readBody: (req: MockRequestContext["req"]) => Promise<unknown>;
  resetDb: () => void;
  clearSessionCookie: (res: MockRequestContext["res"]) => void;
  nowIso: () => string;
  ensureId: () => string;
  saveDb: () => void;
  safeStringify: (value: unknown) => string;
  allowDevReset: boolean;
  legalDocumentVersion: string;
};

type RumBatchRequest = {
  events?: Array<{
    type?: string;
    payload?: unknown;
    route?: string;
    at?: string;
  }>;
};

export const createRuntimeRoutes = (deps: RuntimeRoutesDeps): MockRouteHandler => {
  return async ({ path, method, req, res, db, actorUser }) => {
    if (path === "/api/dev/reset" && method === "POST") {
      if (!deps.allowDevReset) {
        deps.json(res, 403, {
          error: "Dev reset endpoint disabled for current runtime policy.",
        });
        return true;
      }
      deps.resetDb();
      deps.clearSessionCookie(res);
      deps.json(res, 200, { ok: true });
      return true;
    }

    if (path === "/api/telemetry/rum" && method === "POST") {
      const body = (await deps.readBody(req)) as RumBatchRequest;
      const events = Array.isArray(body?.events) ? body.events.slice(0, 100) : [];
      const timestamp = deps.nowIso();

      if (events.length > 0) {
        events.forEach((event) => {
          const eventType =
            typeof event?.type === "string" && event.type.trim().length > 0
              ? event.type.trim()
              : "unknown";
          const route =
            typeof event?.route === "string" && event.route.trim().length > 0
              ? event.route.trim()
              : undefined;

          db.rumTelemetry.push({
            id: deps.ensureId(),
            type: eventType,
            payload: deps.safeStringify(event?.payload ?? {}),
            route,
            userId: actorUser?.id ?? null,
            createdAt:
              typeof event?.at === "string" && event.at.trim().length > 0
                ? event.at
                : timestamp,
          });
        });

        if (db.rumTelemetry.length > 2000) {
          db.rumTelemetry = db.rumTelemetry
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 2000);
        }
        deps.saveDb();
      }

      deps.json(res, 202, { ok: true, accepted: events.length });
      return true;
    }

    if (path === "/api/legal/consent-policy" && method === "GET") {
      deps.json(res, 200, {
        documentVersion: deps.legalDocumentVersion,
        checkoutRequiredScopes: ["terms", "privacy", "checkout"],
        trialBookingRequiredScopes: ["terms", "privacy", "trial_booking"],
      });
      return true;
    }

    return false;
  };
};
