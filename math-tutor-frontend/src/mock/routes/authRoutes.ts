import type {
  MockActorUser,
  MockRequestContext,
  MockRouteHandler,
} from "../runtime/requestContext";

type AuthSessionRoutesDeps = {
  json: (res: MockRequestContext["res"], status: number, data: unknown) => void;
  safeUser: (user: MockActorUser) => unknown;
  clearSessionCookie: (res: MockRequestContext["res"]) => void;
  revokeAuthSession: (db: MockRequestContext["db"], sessionId: string, timestamp?: string) => boolean;
  nowIso: () => string;
  saveDb: () => void;
};

export const createAuthSessionRoutes = (
  deps: AuthSessionRoutesDeps
): MockRouteHandler => {
  return async ({ path, method, res, actorSession, actorUser, db }) => {
    if (path === "/api/auth/session" && method === "GET") {
      if (!actorSession || !actorUser) {
        deps.clearSessionCookie(res);
        deps.json(res, 200, null);
        return true;
      }
      deps.json(res, 200, deps.safeUser(actorUser));
      return true;
    }

    if (path === "/api/auth/logout" && method === "POST") {
      if (actorSession) {
        deps.revokeAuthSession(db, actorSession.id, deps.nowIso());
        deps.saveDb();
      }
      deps.clearSessionCookie(res);
      deps.json(res, 200, { ok: true });
      return true;
    }

    return false;
  };
};
