import { api, isRecoverableApiError } from "@/shared/api/client";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import { enqueueOutboxRequest } from "@/shared/lib/outbox";
import { t } from "@/shared/i18n";

export async function getTeacherAvailability(
  userId: string
): Promise<AvailabilitySlot[]> {
  return api.get<AvailabilitySlot[]>(`/teacher-availability/${userId}`);
}

export async function saveTeacherAvailability(
  userId: string,
  slots: AvailabilitySlot[]
): Promise<AvailabilitySlot[]> {
  try {
    return await api.put<AvailabilitySlot[]>(
      `/teacher-availability/${userId}`,
      slots
    );
  } catch (error) {
    if (isRecoverableApiError(error)) {
      enqueueOutboxRequest({
        title: t("common.retryTeacherSlotsSaveAction"),
        method: "PUT",
        path: `/teacher-availability/${userId}`,
        body: slots,
        dedupeKey: `teacher-availability:${userId}`,
      });
      return slots;
    }
    throw error;
  }
}
