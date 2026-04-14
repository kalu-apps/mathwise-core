import { ApiError } from "@/shared/api/client";
import {
  confirmBookingSlotHold,
  createBooking,
  createBookingSlotHold,
  getBookingSlotHoldStatus,
} from "@/entities/booking/model/storage";
import type { Booking } from "@/entities/booking/model/types";

const BOOKING_CONSENTS = ["terms", "privacy", "trial_booking"] as const;

type BookingSlotInput = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};

type StudentBookingInput = {
  teacherId: string;
  teacherName: string;
  teacherPhoto?: string;
  studentId: string;
  studentFirstName?: string;
  studentLastName?: string;
  studentEmail: string;
  studentPhone?: string;
  studentPhoto?: string;
  slot: BookingSlotInput;
};

type GuestBookingInput = {
  teacherId: string;
  teacherName: string;
  teacherPhoto?: string;
  studentEmail: string;
  studentFirstName: string;
  studentLastName: string;
  studentPhone: string;
  slot: BookingSlotInput;
};

export const extractBookingApiErrorCode = (error: unknown): string => {
  if (!(error instanceof ApiError)) return "";
  const details = (error.details ?? {}) as { code?: string };
  return String(details.code ?? "").trim();
};

export const isBookingV2UnavailableError = (error: unknown): boolean => {
  if (!(error instanceof ApiError)) return false;
  const code = extractBookingApiErrorCode(error);
  if (code === "booking_v2_disabled") return true;
  return error.status === 404;
};

export const buildBookingFlowSteps = (params: {
  bookingOpen: boolean;
  selectedSlotId: string | null;
  guestCheckoutOpen: boolean;
  pendingAuthOpen: boolean;
  pendingAuthRebookSlotId: string | null;
  pendingAuthHoldId: string | null;
  bookingSaving: boolean;
  userPresent: boolean;
}) => {
  const slotState = params.selectedSlotId
    ? "done"
    : params.bookingOpen
      ? "current"
      : "pending";
  const identityState =
    params.guestCheckoutOpen ||
    params.pendingAuthOpen ||
    Boolean(params.pendingAuthRebookSlotId) ||
    Boolean(params.pendingAuthHoldId)
      ? "current"
      : params.userPresent
        ? "done"
        : "pending";
  const confirmState =
    params.bookingSaving ||
    Boolean(params.pendingAuthRebookSlotId) ||
    Boolean(params.pendingAuthHoldId)
      ? "current"
      : params.selectedSlotId && params.userPresent
        ? "current"
        : "pending";

  return [
    {
      key: "slot",
      title: "1. Выберите слот",
      description: "Зафиксируйте удобное время у преподавателя.",
      state: slotState as "done" | "current" | "pending",
    },
    {
      key: "identity",
      title: "2. Подтвердите аккаунт",
      description:
        "Для индивидуального занятия нужен полный профиль ученика без гостевого режима.",
      state: identityState as "done" | "current" | "pending",
    },
    {
      key: "confirm",
      title: "3. Подтверждение записи",
      description:
        "После авторизации система подтверждает бронь и открывает доступ к чату и доске.",
      state: confirmState as "current" | "pending",
    },
  ];
};

export const reserveAndConfirmStudentBooking = async (
  input: StudentBookingInput
): Promise<Booking> => {
  try {
    const hold = await createBookingSlotHold(
      {
        teacherId: input.teacherId,
        slotId: input.slot.id,
        studentEmail: input.studentEmail,
      },
      { idempotencyKey: `hold:${input.slot.id}:${input.studentId}` }
    );
    const holdStatus = await getBookingSlotHoldStatus(hold.hold.id);
    if (!holdStatus.canConfirm || holdStatus.hold.status !== "active") {
      throw new ApiError("Время удержания слота истекло. Выберите новый слот.", 409, {
        code: "slot_hold_expired",
      });
    }
    return confirmBookingSlotHold(
      hold.hold.id,
      {
        consents: { acceptedScopes: [...BOOKING_CONSENTS] },
      },
      { idempotencyKey: `hold-confirm:${hold.hold.id}:${input.studentId}` }
    );
  } catch (error) {
    if (!isBookingV2UnavailableError(error)) {
      throw error;
    }
  }

  return createBooking({
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    teacherPhoto: input.teacherPhoto,
    studentId: input.studentId,
    studentName:
      `${input.studentFirstName ?? ""} ${input.studentLastName ?? ""}`.trim() ||
      input.studentEmail,
    studentEmail: input.studentEmail,
    studentPhone: input.studentPhone,
    studentPhoto: input.studentPhoto,
    slotId: input.slot.id,
    date: input.slot.date,
    startTime: input.slot.startTime,
    endTime: input.slot.endTime,
    lessonKind: "regular",
    consents: { acceptedScopes: [...BOOKING_CONSENTS] },
  });
};

export const reserveGuestBookingOrCreateLegacy = async (
  input: GuestBookingInput
):
  Promise<
    | {
        mode: "hold_created";
        holdId: string;
        nextAction?: string;
      }
    | { mode: "legacy_booked" }
  > => {
  try {
    const hold = await createBookingSlotHold(
      {
        teacherId: input.teacherId,
        slotId: input.slot.id,
        studentEmail: input.studentEmail,
      },
      { idempotencyKey: `hold:${input.slot.id}:${input.studentEmail}` }
    );
    return {
      mode: "hold_created",
      holdId: hold.hold.id,
      nextAction: hold.nextAction,
    };
  } catch (error) {
    if (!isBookingV2UnavailableError(error)) {
      throw error;
    }
  }

  await createBooking({
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    teacherPhoto: input.teacherPhoto,
    studentEmail: input.studentEmail,
    studentFirstName: input.studentFirstName,
    studentLastName: input.studentLastName,
    studentPhone: input.studentPhone,
    slotId: input.slot.id,
    date: input.slot.date,
    startTime: input.slot.startTime,
    endTime: input.slot.endTime,
    lessonKind: "trial",
    consents: { acceptedScopes: [...BOOKING_CONSENTS] },
  });

  return { mode: "legacy_booked" };
};

export const confirmHoldAfterAuth = async (params: {
  holdId: string;
  studentId: string;
}): Promise<
  | { mode: "confirmed"; slotId: string }
  | { mode: "inactive"; nextAction?: string }
> => {
  const holdStatus = await getBookingSlotHoldStatus(params.holdId);
  if (!holdStatus.canConfirm || holdStatus.hold.status !== "active") {
    return { mode: "inactive", nextAction: holdStatus.nextAction };
  }

  await confirmBookingSlotHold(
    holdStatus.hold.id,
    {
      consents: { acceptedScopes: [...BOOKING_CONSENTS] },
    },
    { idempotencyKey: `hold-confirm:${holdStatus.hold.id}:${params.studentId}` }
  );

  return { mode: "confirmed", slotId: holdStatus.hold.slotId };
};

export const createLegacyBookingAfterAuth = async (
  input: StudentBookingInput
): Promise<void> => {
  await createBooking({
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    teacherPhoto: input.teacherPhoto,
    studentId: input.studentId,
    studentName:
      `${input.studentFirstName ?? ""} ${input.studentLastName ?? ""}`.trim() ||
      input.studentEmail,
    studentEmail: input.studentEmail,
    studentPhone: input.studentPhone,
    studentPhoto: input.studentPhoto,
    slotId: input.slot.id,
    date: input.slot.date,
    startTime: input.slot.startTime,
    endTime: input.slot.endTime,
    lessonKind: "regular",
    consents: { acceptedScopes: [...BOOKING_CONSENTS] },
  });
};
