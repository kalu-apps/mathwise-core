import { selectPurchaseFinancialView } from "@/entities/purchase/model/selectors";
import type { Booking } from "@/entities/booking/model/types";
import type { StudentStudyCabinetCourseItem } from "@/features/study-cabinet/student/model/types";
import { getBookingEndTimestamp, getBookingStartTimestamp } from "@/shared/lib/time";

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

export const buildStudentProgressVisual = (value: number) => {
  const percent = clampPercent(value);
  const normalized = percent / 100;
  const eased =
    percent <= 40
      ? (percent / 40) * 0.58
      : 0.58 + ((percent - 40) / 60) * 0.42;
  const hue = Math.round(4 + eased * 126);
  const saturation = Math.round(92 - normalized * 14);
  const lightness = percent === 0 ? 46 : Math.round(48 + normalized * 8);
  const color = `hsl(${hue} ${saturation}% ${lightness}%)`;
  const glow = `hsla(${hue} 96% ${Math.max(44, lightness)}% / 0.32)`;
  return { percent, color, glow };
};

export const selectUpcomingBooking = (
  bookings: Booking[],
  now = Date.now()
): Booking | null => {
  const oneDay = 24 * 60 * 60 * 1000;
  let nearest: Booking | null = null;
  let minDiff = Number.POSITIVE_INFINITY;
  bookings.forEach((booking) => {
    if (!booking.date || !booking.startTime) return;
    const start = getBookingStartTimestamp(booking);
    if (!Number.isFinite(start)) return;
    const diff = start - now;
    if (diff > 0 && diff <= oneDay && diff < minDiff) {
      minDiff = diff;
      nearest = booking;
    }
  });
  return nearest;
};

export const selectUnpaidCompletedBooking = (
  bookings: Booking[],
  now = Date.now()
): Booking | null => {
  const completedUnpaid = bookings
    .filter((booking) => {
      const endTime = getBookingEndTimestamp(booking);
      return Number.isFinite(endTime) && endTime < now && booking.paymentStatus !== "paid";
    })
    .sort((a, b) => getBookingEndTimestamp(b) - getBookingEndTimestamp(a));
  return completedUnpaid[0] ?? null;
};

export const sortBookingsByTimeline = (
  bookings: Booking[],
  now = Date.now()
): Booking[] => {
  const upcoming = bookings
    .filter((booking) => getBookingEndTimestamp(booking) >= now)
    .sort((a, b) => getBookingStartTimestamp(a) - getBookingStartTimestamp(b));
  const past = bookings
    .filter((booking) => getBookingEndTimestamp(booking) < now)
    .sort((a, b) => getBookingEndTimestamp(b) - getBookingEndTimestamp(a));
  return [...upcoming, ...past];
};

export const splitBookingsByCompletion = (
  bookings: Booking[],
  now = Date.now()
) => ({
  scheduled: bookings.filter((booking) => getBookingEndTimestamp(booking) >= now),
  completed: bookings.filter((booking) => getBookingEndTimestamp(booking) < now),
});

export const countScheduledBookings = (bookings: Booking[], now = Date.now()) =>
  bookings.filter((booking) => getBookingEndTimestamp(booking) > now).length;

export const filterStudentCoursesByQuery = (
  items: StudentStudyCabinetCourseItem[],
  query: string
) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;
  return items.filter((item) =>
    item.course.title.toLowerCase().includes(normalizedQuery)
  );
};

export const resolveSafePage = (page: number, totalItems: number, pageSize: number) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    safePage: Math.min(page, totalPages),
    totalPages,
  };
};

export const paginateItems = <T,>(items: T[], page: number, pageSize: number): T[] => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

export type BnplReminderItem = {
  purchaseId: string;
  courseTitle: string;
  financialStatus: "upcoming" | "grace" | "restricted" | "suspended";
  nextPaymentDate: string | null;
  overdueDays: number;
};

export const buildBnplReminderItems = (
  items: StudentStudyCabinetCourseItem[]
): BnplReminderItem[] =>
  items
    .map((item) => {
      const financial = selectPurchaseFinancialView(item.purchase);
      if (financial.paymentMethod !== "bnpl") return null;
      if (
        financial.financialStatus !== "upcoming" &&
        financial.financialStatus !== "grace" &&
        financial.financialStatus !== "restricted" &&
        financial.financialStatus !== "suspended"
      ) {
        return null;
      }
      return {
        purchaseId: item.purchase.id,
        courseTitle: item.course.title,
        financialStatus: financial.financialStatus,
        nextPaymentDate: financial.nextPaymentDate,
        overdueDays: financial.overdueDays,
      };
    })
    .filter((entry): entry is BnplReminderItem => Boolean(entry))
    .sort((a, b) => {
      const rank = (status: BnplReminderItem["financialStatus"]) => {
        if (status === "suspended") return 0;
        if (status === "restricted") return 1;
        if (status === "grace") return 2;
        return 3;
      };
      const rankDiff = rank(a.financialStatus) - rank(b.financialStatus);
      if (rankDiff !== 0) return rankDiff;
      if (a.nextPaymentDate && b.nextPaymentDate) {
        return a.nextPaymentDate.localeCompare(b.nextPaymentDate);
      }
      if (a.nextPaymentDate) return -1;
      if (b.nextPaymentDate) return 1;
      return 0;
    });

export const formatBookingReminderDate = (booking: Booking) =>
  new Date(`${booking.date}T${booking.startTime}`).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
