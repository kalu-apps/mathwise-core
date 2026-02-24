import { api } from "@/shared/api/client";
import type {
  DeleteTeacherChatMessagePayload,
  SendTeacherChatMessagePayload,
  TeacherChatEligibility,
  TeacherChatMessage,
  TeacherChatThread,
  UpdateTeacherChatMessagePayload,
} from "./types";

export async function getTeacherChatEligibility(): Promise<TeacherChatEligibility> {
  return api.get<TeacherChatEligibility>("/chat/eligibility", {
    cacheTtlMs: 2_000,
  });
}

export async function getTeacherChatThreads(): Promise<TeacherChatThread[]> {
  return api.get<TeacherChatThread[]>("/chat/threads", {
    cacheTtlMs: 1_000,
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
