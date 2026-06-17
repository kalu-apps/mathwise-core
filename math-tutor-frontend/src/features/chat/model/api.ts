import { api, buildApiUrl } from "@/shared/api/client";
import type {
  DeleteTeacherChatMessagePayload,
  MarkTeacherChatVoiceListenedPayload,
  SendTeacherChatMessagePayload,
  TeacherChatEligibility,
  TeacherChatMediaAccess,
  TeacherChatMessage,
  TeacherChatRealtimeEvent,
  TeacherChatThread,
  UpdateTeacherChatMessagePayload,
} from "./types";

export async function getTeacherChatEligibility(): Promise<TeacherChatEligibility> {
  return api.get<TeacherChatEligibility>("/chat/eligibility", {
    cacheTtlMs: 2_000,
  });
}

export async function getTeacherChatThreads(options?: {
  forceFresh?: boolean;
}): Promise<TeacherChatThread[]> {
  return api.get<TeacherChatThread[]>("/chat/threads", {
    cacheTtlMs: options?.forceFresh ? 0 : 1_000,
    dedupe: options?.forceFresh ? false : undefined,
  });
}

export async function getTeacherChatMessages(
  threadId: string
): Promise<TeacherChatMessage[]> {
  const query = new URLSearchParams({ threadId }).toString();
  return api.get<TeacherChatMessage[]>(`/chat/messages?${query}`, {
    cacheTtlMs: 500,
  });
}

export async function getTeacherChatMessageMediaAccess(params: {
  threadId: string;
  messageId: string;
  mediaObjectId: string;
}): Promise<TeacherChatMediaAccess> {
  const query = new URLSearchParams({ threadId: params.threadId }).toString();
  return api.get<TeacherChatMediaAccess>(
    `/chat/messages/${encodeURIComponent(params.messageId)}/media/${encodeURIComponent(
      params.mediaObjectId
    )}/access?${query}`,
    {
      cacheTtlMs: 0,
      dedupe: false,
      timeoutMs: 8_000,
    }
  );
}

export function subscribeTeacherChatEvents(params: {
  threadId?: string | null;
  lastEventId?: number;
  onEvent: (event: TeacherChatRealtimeEvent) => void;
  onOpen?: () => void;
  onError?: () => void;
}): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => undefined;
  }

  const query = new URLSearchParams();
  if (params.threadId) {
    query.set("threadId", params.threadId);
  }
  if (params.lastEventId && params.lastEventId > 0) {
    query.set("lastEventId", String(Math.floor(params.lastEventId)));
  }
  const suffix = query.toString();
  const source = new EventSource(
    `${buildApiUrl("/chat/events")}${suffix ? `?${suffix}` : ""}`,
    {
      withCredentials: true,
    }
  );

  source.onopen = () => {
    params.onOpen?.();
  };
  source.onerror = () => {
    params.onError?.();
  };
  source.addEventListener("chat", (event) => {
    try {
      params.onEvent(JSON.parse(event.data) as TeacherChatRealtimeEvent);
    } catch {
      // Ignore malformed realtime frames; the polling fallback will recover state.
    }
  });

  return () => {
    source.close();
  };
}

export async function sendTeacherChatMessage(
  payload: SendTeacherChatMessagePayload
): Promise<TeacherChatMessage> {
  return api.post<TeacherChatMessage>("/chat/messages", payload, {
    notifyDataUpdate: true,
  });
}

export async function markTeacherChatThreadRead(threadId: string): Promise<void> {
  await api.post<{ ok: boolean }>(
    "/chat/threads/mark-read",
    { threadId },
    { notifyDataUpdate: false }
  );
}

export async function clearTeacherChatThread(
  threadId: string
): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/chat/threads/${threadId}/clear`, {});
}

export async function updateTeacherChatMessage(
  payload: UpdateTeacherChatMessagePayload
): Promise<TeacherChatMessage> {
  return api.put<TeacherChatMessage>(`/chat/messages/${payload.messageId}`, {
    threadId: payload.threadId,
    text: payload.text,
    attachments: payload.attachments ?? [],
    voice: payload.voice,
  });
}

export async function deleteTeacherChatMessage(
  payload: DeleteTeacherChatMessagePayload
): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/chat/messages/${payload.messageId}/delete`, {
    threadId: payload.threadId,
    scope: payload.scope,
  });
}

export async function markTeacherChatVoiceListened(
  payload: MarkTeacherChatVoiceListenedPayload
): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(
    `/chat/messages/${payload.messageId}/voice/listened`,
    {
      threadId: payload.threadId,
    },
    {
      notifyDataUpdate: false,
    }
  );
}
