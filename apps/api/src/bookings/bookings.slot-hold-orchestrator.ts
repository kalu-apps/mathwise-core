import { HttpException } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { AuthRepository } from "../auth/auth.repository";
import type { ApiRuntimeConfig } from "../config/runtime.config";
import { validateEmailFormat } from "../purchases/purchases.helpers";
import { BookingsRepository } from "./bookings.repository";
import {
  IDEMPOTENCY_TTL_SEC,
  ensureId,
  hasValidTimeRange,
  isFutureDateTime,
  isPgIntegrityViolation,
  normalizeEmail,
  normalizePhone,
  nowIso,
} from "./bookings.helpers";
import type {
  BookingDto,
  BookingRecord,
  BookingSlotHoldDto,
  BookingSlotHoldStatusResponseDto,
  ConfirmBookingSlotHoldPayloadDto,
  CreateBookingSlotHoldPayloadDto,
} from "./bookings.types";

type WithLock = <T>(key: string, operation: () => Promise<T>) => Promise<T>;

export class BookingSlotHoldOrchestrator {
  constructor(
    private readonly deps: {
      runtimeConfig: ApiRuntimeConfig;
      bookingsRepository: BookingsRepository;
      authRepository: AuthRepository;
      withLock: WithLock;
      assertIdentityUsableForBooking: (actorUser: AuthUserDto) => Promise<void>;
      syncBookingCapabilities: (booking: BookingRecord) => Promise<void>;
    }
  ) {}

  async createSlotHold(params: {
    payload: CreateBookingSlotHoldPayloadDto;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<BookingSlotHoldStatusResponseDto> {
    this.assertBookingV2Enabled();
    if (params.actorUser?.role === "teacher") {
      throw new HttpException(
        { error: "Преподаватель не может создавать hold для записи.", code: "forbidden" },
        403
      );
    }

    const teacherId = params.payload.teacherId?.trim();
    const slotId = params.payload.slotId?.trim();
    if (!teacherId || !slotId) {
      throw new HttpException(
        { error: "teacherId и slotId обязательны.", code: "validation_failed" },
        400
      );
    }

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached =
        await this.deps.bookingsRepository.findIdempotentResponse<BookingSlotHoldStatusResponseDto>(
          "booking:hold:create",
          normalizedIdempotency
        );
      if (cached) return cached;
    }

    const slot = await this.deps.bookingsRepository.findAvailabilitySlot(slotId);
    if (!slot || slot.teacherId !== teacherId) {
      throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
    }
    if (
      !hasValidTimeRange(slot.startTime, slot.endTime) ||
      !isFutureDateTime(slot.date, slot.startTime)
    ) {
      await this.deps.bookingsRepository.removeAvailabilitySlot(slot.id);
      throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
    }

    const teacher = await this.deps.authRepository.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") {
      throw new HttpException({ error: "Преподаватель не найден.", code: "teacher_not_found" }, 404);
    }

    const payloadEmail = normalizeEmail(params.payload.studentEmail);
    let identityEmailCanonical = "";
    let nextAction: BookingSlotHoldStatusResponseDto["nextAction"] =
      "complete_registration";

    if (params.actorUser?.role === "student") {
      const actorEmail = normalizeEmail(params.actorUser.email);
      if (payloadEmail && payloadEmail !== actorEmail) {
        throw new HttpException(
          {
            error: "Email hold должен совпадать с авторизованным аккаунтом.",
            code: "identity_conflict_auth_required",
            nextAction: "login_and_attach",
          },
          409
        );
      }
      identityEmailCanonical = actorEmail;
      nextAction = "complete_registration";
    } else if (payloadEmail) {
      if (!validateEmailFormat(payloadEmail)) {
        throw new HttpException(
          { error: "Некорректный email для записи на занятие.", code: "validation_failed" },
          400
        );
      }
      identityEmailCanonical = payloadEmail;
      const existingUser = await this.deps.authRepository.findByEmail(payloadEmail);
      if (existingUser?.role === "teacher") {
        throw new HttpException(
          {
            error: "Этот email принадлежит преподавателю. Используйте email ученика.",
            code: "validation_failed",
          },
          400
        );
      }
      if (existingUser?.role === "student") {
        nextAction = "login_required_existing_account";
      }
    }

    const createdAt = nowIso();
    const expiresAt = new Date(
      Date.now() + this.deps.runtimeConfig.bookingSlotHoldTtlSec * 1000
    ).toISOString();
    const hold: BookingSlotHoldDto = {
      id: ensureId("slot_hold"),
      slotId: slot.id,
      teacherId,
      teacherName:
        `${teacher.firstName} ${teacher.lastName}`.trim() || params.payload.teacherId,
      teacherPhoto: teacher.photo,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: "active",
      identityEmailCanonical: identityEmailCanonical || undefined,
      createdAt,
      expiresAt,
    };

    const lockKey = `lock:booking:hold:slot:${slot.id}`;
    await this.deps.withLock(lockKey, async () => {
      const existingActiveHold =
        await this.deps.bookingsRepository.findActiveSlotHoldBySlotId(slot.id);
      if (existingActiveHold && Date.parse(existingActiveHold.expiresAt) > Date.now()) {
        throw new HttpException(
          { error: "Слот уже удерживается другим запросом.", code: "slot_hold_conflict" },
          409
        );
      }
      if (existingActiveHold && Date.parse(existingActiveHold.expiresAt) <= Date.now()) {
        await this.deps.bookingsRepository.transitionSlotHoldToReleasedAtomic({
          holdId: existingActiveHold.id,
          status: "expired",
          releasedAt: nowIso(),
        });
      }

      const created = await this.deps.bookingsRepository.createSlotHoldWithSlotClaim({
        hold: {
          ...hold,
          initiatedByUserId: params.actorUser?.id,
        },
        slotId: slot.id,
      });
      if (!created) {
        throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
      }
    });

    const response: BookingSlotHoldStatusResponseDto = {
      ok: true,
      hold,
      canConfirm: Boolean(params.actorUser?.role === "student"),
      nextAction,
    };

    if (normalizedIdempotency) {
      await this.deps.bookingsRepository.saveIdempotentResponse(
        "booking:hold:create",
        normalizedIdempotency,
        response,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return response;
  }

  async getSlotHoldStatus(params: {
    holdId: string;
  }): Promise<BookingSlotHoldStatusResponseDto> {
    this.assertBookingV2Enabled();
    const holdId = params.holdId.trim();
    if (!holdId) {
      throw new HttpException({ error: "holdId обязателен.", code: "validation_failed" }, 400);
    }

    const hold = await this.deps.bookingsRepository.findSlotHoldById(holdId);
    if (!hold) {
      throw new HttpException({ error: "Slot hold не найден.", code: "not_found" }, 404);
    }

    if (hold.status === "active" && Date.parse(hold.expiresAt) <= Date.now()) {
      const expired = await this.deps.bookingsRepository.transitionSlotHoldToReleasedAtomic({
        holdId: hold.id,
        status: "expired",
        releasedAt: nowIso(),
      });
      if (!expired) {
        throw new HttpException({ error: "Slot hold не найден.", code: "not_found" }, 404);
      }
      return {
        ok: true,
        hold: expired,
        canConfirm: false,
        nextAction: "hold_expired",
      };
    }

    return {
      ok: true,
      hold,
      canConfirm: hold.status === "active",
      nextAction:
        hold.status === "active"
          ? "complete_registration"
          : hold.status === "consumed"
            ? "hold_consumed"
            : hold.status === "released"
              ? "hold_released"
              : "hold_expired",
    };
  }

  async confirmSlotHoldBooking(params: {
    holdId: string;
    payload: ConfirmBookingSlotHoldPayloadDto;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<BookingDto> {
    this.assertBookingV2Enabled();
    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация.", code: "unauthorized" }, 401);
    }
    if (actorUser.role !== "student") {
      throw new HttpException({ error: "Запись доступна только ученику.", code: "forbidden" }, 403);
    }

    const holdId = params.holdId.trim();
    if (!holdId) {
      throw new HttpException({ error: "holdId обязателен.", code: "validation_failed" }, 400);
    }

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.deps.bookingsRepository.findIdempotentResponse<BookingDto>(
        "booking:hold:confirm",
        normalizedIdempotency
      );
      if (cached) {
        return cached;
      }
    }

    const lockKey = `lock:booking:hold:confirm:${holdId}`;
    const booking = await this.deps.withLock(lockKey, async () => {
      const hold = await this.deps.bookingsRepository.findSlotHoldById(holdId);
      if (!hold) {
        throw new HttpException({ error: "Slot hold не найден.", code: "not_found" }, 404);
      }

      if (hold.status === "active" && Date.parse(hold.expiresAt) <= Date.now()) {
        await this.deps.bookingsRepository.transitionSlotHoldToReleasedAtomic({
          holdId: hold.id,
          status: "expired",
          releasedAt: nowIso(),
        });
        throw new HttpException(
          { error: "Время удержания слота истекло.", code: "slot_hold_expired" },
          409
        );
      }

      if (hold.status === "released" || hold.status === "expired") {
        throw new HttpException(
          { error: "Слот hold больше не активен.", code: "slot_hold_inactive" },
          409
        );
      }

      if (hold.status === "consumed") {
        const existing = await this.deps.bookingsRepository.findBookingBySlotId(hold.slotId);
        if (existing?.studentId === actorUser.id) {
          return existing;
        }
        throw new HttpException(
          { error: "Slot hold уже использован.", code: "slot_hold_consumed" },
          409
        );
      }

      await this.deps.assertIdentityUsableForBooking(actorUser);

      const teacher = await this.deps.authRepository.findById(hold.teacherId);
      if (!teacher || teacher.role !== "teacher") {
        throw new HttpException({ error: "Преподаватель не найден.", code: "teacher_not_found" }, 404);
      }

      const hasPreviousBookings = await this.deps.bookingsRepository.hasBookingsForStudent(
        actorUser.id
      );
      const acceptedScopes = Array.isArray(params.payload.consents?.acceptedScopes)
        ? params.payload.consents?.acceptedScopes
            .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
            .filter((scope) => scope.length > 0)
        : [];
      const createdAt = nowIso();
      const booking: BookingRecord = {
        id: ensureId("booking"),
        slotId: hold.slotId,
        teacherId: hold.teacherId,
        teacherName: hold.teacherName || `${teacher.firstName} ${teacher.lastName}`.trim(),
        teacherPhoto: hold.teacherPhoto || teacher.photo,
        studentId: actorUser.id,
        studentName:
          `${actorUser.firstName} ${actorUser.lastName}`.trim() || actorUser.email,
        studentEmail: normalizeEmail(actorUser.email),
        studentPhone: normalizePhone(actorUser.phone),
        studentPhoto: actorUser.photo,
        date: hold.date,
        startTime: hold.startTime,
        endTime: hold.endTime,
        lessonKind: hasPreviousBookings ? "regular" : "trial",
        status: "scheduled",
        paymentStatus: "unpaid",
        meetingUrl: "",
        materials: [],
        consentSnapshot:
          acceptedScopes.length > 0
            ? {
                acceptedScopes,
                source: "student_booking",
                acceptedAt: createdAt,
              }
            : undefined,
        identityKind: "user_bound",
        identityEmailCanonical: normalizeEmail(actorUser.email),
        createdAt,
      };

      try {
        const confirmed = await this.deps.bookingsRepository.confirmSlotHoldBookingAtomic({
          holdId: hold.id,
          consumedAt: createdAt,
          booking,
        });
        if (confirmed.outcome === "confirmed") {
          return booking;
        }
        if (confirmed.outcome === "consumed") {
          const existing = await this.deps.bookingsRepository.findBookingBySlotId(hold.slotId);
          if (existing?.studentId === actorUser.id) {
            return existing;
          }
          throw new HttpException(
            { error: "Slot hold уже использован.", code: "slot_hold_consumed" },
            409
          );
        }
        if (confirmed.outcome === "released" || confirmed.outcome === "expired") {
          throw new HttpException(
            { error: "Слот hold больше не активен.", code: "slot_hold_inactive" },
            409
          );
        }
        throw new HttpException({ error: "Slot hold не найден.", code: "not_found" }, 404);
      } catch (error) {
        if (isPgIntegrityViolation(error)) {
          const existing = await this.deps.bookingsRepository.findBookingBySlotId(hold.slotId);
          if (existing?.studentId === actorUser.id) {
            return existing;
          }
          throw new HttpException({ error: "Слот уже недоступен", code: "slot_conflict" }, 409);
        }
        throw error;
      }
    });

    await this.deps.syncBookingCapabilities(booking);

    if (normalizedIdempotency) {
      await this.deps.bookingsRepository.saveIdempotentResponse(
        "booking:hold:confirm",
        normalizedIdempotency,
        booking,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return booking;
  }

  private assertBookingV2Enabled() {
    if (!this.deps.runtimeConfig.bookingV2Enabled) {
      throw new HttpException(
        { error: "Booking v2 flow отключен в текущем runtime.", code: "booking_v2_disabled" },
        404
      );
    }
  }
}
