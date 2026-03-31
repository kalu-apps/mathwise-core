import type { IncomingMessage, ServerResponse } from "http";
import type { AuthSessionRecord } from "../../domain/auth-payments/model/types";
import type { MockDb } from "../db";

export type MockActorUser = MockDb["users"][number];

export type MockRequestContext = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  path: string;
  method: string;
  db: MockDb;
  actorUser: MockActorUser | null;
  actorSession: AuthSessionRecord | null;
};

export type MockRouteHandler = (context: MockRequestContext) => Promise<boolean>;

export const runRouteHandlers = async (
  handlers: readonly MockRouteHandler[],
  context: MockRequestContext
): Promise<boolean> => {
  for (const handler of handlers) {
    if (await handler(context)) {
      return true;
    }
  }
  return false;
};
