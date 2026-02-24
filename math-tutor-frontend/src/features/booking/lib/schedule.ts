import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";

export type CalendarDay = {
  value: string;
  label: string;
  weekday: string;
  isToday: boolean;
  isWeekend: boolean;
};

export const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getSlotStartTimestamp = (slot: Pick<AvailabilitySlot, "date" | "startTime">) =>
  new Date(`${slot.date}T${slot.startTime}`).getTime();

const getSlotEndTimestamp = (slot: Pick<AvailabilitySlot, "date" | "endTime">) =>
  new Date(`${slot.date}T${slot.endTime}`).getTime();

export const isFutureSlot = (
  slot: Pick<AvailabilitySlot, "date" | "startTime">,
  now = Date.now()
) => getSlotStartTimestamp(slot) > now;

export const normalizeFutureSlots = (
  slots: AvailabilitySlot[],
  now = Date.now()
) =>
  [...slots]
    .filter(
      (slot) =>
        Boolean(slot.date) &&
        Boolean(slot.startTime) &&
        Boolean(slot.endTime) &&
        Number.isFinite(getSlotStartTimestamp(slot)) &&
        Number.isFinite(getSlotEndTimestamp(slot)) &&
        getSlotEndTimestamp(slot) > getSlotStartTimestamp(slot) &&
        isFutureSlot(slot, now)
    )
    .sort((a, b) => getSlotStartTimestamp(a) - getSlotStartTimestamp(b));

export const groupSlotsByDate = (slots: AvailabilitySlot[]) =>
  slots.reduce<Record<string, AvailabilitySlot[]>>((acc, slot) => {
    acc[slot.date] = acc[slot.date] ? [...acc[slot.date], slot] : [slot];
    return acc;
  }, {});

export const buildCalendarDays = (days = 21): CalendarDay[] => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: days }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      value: toLocalDateString(date),
      label: date
        .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
        .replace(".", ""),
      weekday: date
        .toLocaleDateString("ru-RU", { weekday: "short" })
        .replace(".", ""),
      isToday: index === 0,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    };
  });
};

export const formatLongDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};
