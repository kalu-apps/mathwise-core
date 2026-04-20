import type { User } from "@/entities/user/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import { normalizeFutureSlots } from "@/features/booking/lib/schedule";

type TeacherAvailabilityMap = Record<string, AvailabilitySlot[]>;

export const normalizeTeacherAvailabilityMap = (
  teachers: User[],
  availabilityByTeacherId: TeacherAvailabilityMap
): TeacherAvailabilityMap =>
  teachers.reduce<TeacherAvailabilityMap>((acc, teacher) => {
    const rawSlots = availabilityByTeacherId[teacher.id] ?? [];
    const normalizedSlots = rawSlots.map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime ?? "",
      endTime: slot.endTime ?? "",
    }));
    acc[teacher.id] = normalizeFutureSlots(normalizedSlots);
    return acc;
  }, {});

export const pickTeacherWithAvailability = (
  teachers: User[],
  availabilityByTeacherId: TeacherAvailabilityMap
): User | null => {
  if (teachers.length === 0) return null;
  return (
    teachers.find(
      (teacher) => (availabilityByTeacherId[teacher.id]?.length ?? 0) > 0
    ) ?? teachers[0]
  );
};
