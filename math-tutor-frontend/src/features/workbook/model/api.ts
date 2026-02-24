import { api } from "@/shared/api/client";
import type {
  WorkbookDraftCard,
  WorkbookEvent,
  WorkbookEventsResponse,
  WorkbookInviteInfo,
  WorkbookLayer,
  WorkbookSessionSettings,
  WorkbookSession,
  WorkbookSessionKind,
  WorkbookSnapshot,
} from "./types";

export async function getWorkbookDrafts(scope: "all" | "personal" | "class" = "all") {
  const query = new URLSearchParams({ scope }).toString();
  return api.get<{ items: WorkbookDraftCard[] }>(`/workbook/drafts?${query}`, {
    cacheTtlMs: 1_000,
  });
}

export async function createWorkbookSession(params: {
  kind: WorkbookSessionKind;
  title?: string;
}) {
  return api.post<{
    session: WorkbookSession;
    draft: WorkbookDraftCard;
  }>("/workbook/sessions", params);
}

export async function getWorkbookSession(sessionId: string) {
  return api.get<WorkbookSession>(`/workbook/sessions/${encodeURIComponent(sessionId)}`, {
    cacheTtlMs: 600,
  });
}

export async function openWorkbookSession(sessionId: string) {
  return api.post<{ ok: true }>(
    `/workbook/sessions/${encodeURIComponent(sessionId)}/open`,
    {},
    { notifyDataUpdate: true }
  );
}

export async function endWorkbookSession(sessionId: string) {
  return api.post<{ ok: true; session: WorkbookSession }>(
    `/workbook/sessions/${encodeURIComponent(sessionId)}/end`,
    {},
    { notifyDataUpdate: true }
  );
}

export async function updateWorkbookSessionSettings(
  sessionId: string,
  payload: Partial<WorkbookSessionSettings>
) {
  return api.put<{ ok: true; session: WorkbookSession }>(
    `/workbook/sessions/${encodeURIComponent(sessionId)}/settings`,
    payload,
    { notifyDataUpdate: false }
  );
}

export async function duplicateWorkbookSession(sessionId: string) {
  return api.post<{
    session: WorkbookSession;
    draft: WorkbookDraftCard;
  }>(`/workbook/sessions/${encodeURIComponent(sessionId)}/duplicate`, {});
}

export async function deleteWorkbookSession(sessionId: string) {
  return api.del<{
    ok: true;
    deletedSessionId: string;
    message: string;
  }>(`/workbook/sessions/${encodeURIComponent(sessionId)}`, {
    notifyDataUpdate: true,
  });
}

export async function renameWorkbookSession(sessionId: string, title: string) {
  return api.put<{ ok: true; session: WorkbookSession }>(
    `/workbook/sessions/${encodeURIComponent(sessionId)}/title`,
    { title },
    { notifyDataUpdate: true }
  );
}

export async function createWorkbookInvite(sessionId: string) {
  return api.post<WorkbookInviteInfo>(
    `/workbook/sessions/${encodeURIComponent(sessionId)}/invite`,
    {}
  );
}

export async function resolveWorkbookInvite(token: string) {
  return api.get<{
    sessionId: string;
    title: string;
    kind: WorkbookSessionKind;
    hostName: string;
    expired: boolean;
    revoked: boolean;
  }>(`/workbook/invites/${encodeURIComponent(token)}`);
}

export async function joinWorkbookInvite(token: string) {
  return api.post<{
    session: WorkbookSession;
    draft: WorkbookDraftCard;
  }>(`/workbook/invites/${encodeURIComponent(token)}/join`, {});
}

export async function getWorkbookEvents(sessionId: string, afterSeq: number) {
  const query = new URLSearchParams({ afterSeq: String(afterSeq) }).toString();
  return api.get<WorkbookEventsResponse>(
    `/workbook/sessions/${encodeURIComponent(sessionId)}/events?${query}`,
    {
      cacheTtlMs: 0,
      dedupe: false,
    }
  );
}

export function subscribeWorkbookEventsStream(params: {
  sessionId: string;
  onEvents: (payload: WorkbookEventsResponse) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Event) => void;
}) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {
      // noop
    };
  }
  const source = new EventSource(
    `/api/workbook/sessions/${encodeURIComponent(params.sessionId)}/events/stream`
  );

  const handlePayload = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const payload = raw as Partial<WorkbookEventsResponse>;
    if (
      typeof payload.sessionId !== "string" ||
      typeof payload.latestSeq !== "number" ||
      !Array.isArray(payload.events)
    ) {
      return;
    }
    params.onEvents({
      sessionId: payload.sessionId,
      latestSeq: payload.latestSeq,
      events: payload.events as WorkbookEvent[],
    });
  };

  source.addEventListener("workbook", (event) => {
    if (!(event instanceof MessageEvent)) return;
    try {
      handlePayload(JSON.parse(String(event.data ?? "{}")));
    } catch {
      // ignore malformed stream payload
    }
  });

  source.onopen = () => {
    params.onConnectionChange?.(true);
  };

  source.onerror = (error) => {
    params.onConnectionChange?.(false);
    params.onError?.(error);
  };

  return () => {
    params.onConnectionChange?.(false);
    source.close();
  };
}

export async function appendWorkbookEvents(params: {
  sessionId: string;
  events: Array<{
    type: WorkbookEvent["type"];
    payload: unknown;
  }>;
}) {
  return api.post<{ events: WorkbookEvent[]; latestSeq: number }>(
    `/workbook/sessions/${encodeURIComponent(params.sessionId)}/events`,
    { events: params.events },
    { notifyDataUpdate: false }
  );
}

export async function getWorkbookSnapshot(sessionId: string, layer: WorkbookLayer) {
  const query = new URLSearchParams({ layer }).toString();
  return api.get<WorkbookSnapshot | null>(
    `/workbook/sessions/${encodeURIComponent(sessionId)}/snapshot?${query}`,
    {
      cacheTtlMs: 0,
      dedupe: false,
    }
  );
}

export async function saveWorkbookSnapshot(params: {
  sessionId: string;
  layer: WorkbookLayer;
  version: number;
  payload: unknown;
}) {
  return api.put<WorkbookSnapshot>(
    `/workbook/sessions/${encodeURIComponent(params.sessionId)}/snapshot`,
    params,
    { notifyDataUpdate: false }
  );
}

export async function heartbeatWorkbookPresence(sessionId: string) {
  return api.post<{ ok: true; participants: WorkbookSession["participants"] }>(
    `/workbook/sessions/${encodeURIComponent(sessionId)}/presence`,
    {},
    { notifyDataUpdate: false }
  );
}

export async function renderWorkbookPdfPages(params: {
  fileName: string;
  dataUrl: string;
  dpi?: number;
  maxPages?: number;
}) {
  return api.post<{
    renderer: "poppler" | "unavailable";
    fileName: string;
    pages: Array<{
      id: string;
      page: number;
      imageUrl: string;
      width?: number;
      height?: number;
    }>;
  }>("/workbook/pdf/render", params, { notifyDataUpdate: false });
}

export async function recognizeWorkbookInk(params: {
  sessionId: string;
  strokes: Array<{
    id: string;
    points: Array<{ x: number; y: number }>;
    width: number;
    color: string;
  }>;
  preferMath?: boolean;
}) {
  return api.post<{
    provider: "mock" | "external";
    supported: boolean;
    result: null | {
      text?: string;
      latex?: string;
      confidence?: number;
    };
  }>("/workbook/ink/recognize", params, { notifyDataUpdate: false });
}
