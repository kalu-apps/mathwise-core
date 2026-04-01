import { api, isRecoverableApiError } from "@/shared/api/client";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import { enqueueOutboxRequest } from "@/shared/lib/outbox";
import { t } from "@/shared/i18n";

export async function getTeacherAvailability(
  userId: string
): Promise<AvailabilitySlot[]> {
  return api.get<AvailabilitySlot[]>(
    `/teachers/${encodeURIComponent(userId)}/availability`,
    {
      dedupe: false,
      cacheTtlMs: 0,
    }
  );
}

export async function saveTeacherAvailability(
  userId: string,
  slots: AvailabilitySlot[]
): Promise<AvailabilitySlot[]> {
  try {
    return await api.put<AvailabilitySlot[]>("/availability/me", {
      slots,
    });
  } catch (error) {
    if (isRecoverableApiError(error)) {
      enqueueOutboxRequest({
        title: t("common.retryTeacherSlotsSaveAction"),
        method: "PUT",
        path: "/availability/me",
        body: {
          slots,
        },
        dedupeKey: `teacher-availability:${userId}`,
      });
      return slots;
    }
    throw error;
  }
}
