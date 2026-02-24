import { api, isRecoverableApiError } from "@/shared/api/client";
import type { TeacherProfile } from "./model/types";
import { enqueueOutboxRequest } from "@/shared/lib/outbox";
import { t } from "@/shared/i18n";

export async function getTeacherProfile(userId: string): Promise<TeacherProfile> {
  return api.get<TeacherProfile>(`/teacher-profiles/${userId}`);
}

export async function saveTeacherProfile(
  userId: string,
  profile: TeacherProfile
): Promise<TeacherProfile> {
  try {
    return await api.put<TeacherProfile>(`/teacher-profiles/${userId}`, profile);
  } catch (error) {
    if (isRecoverableApiError(error)) {
      enqueueOutboxRequest({
        title: t("common.retryTeacherProfileSaveAction"),
        method: "PUT",
        path: `/teacher-profiles/${userId}`,
        body: profile,
        dedupeKey: `teacher-profile:${userId}`,
      });
      return profile;
    }
    throw error;
  }
}
