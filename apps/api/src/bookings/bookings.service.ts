import { HttpException, Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { AuthRepository } from "../auth/auth.repository";
import { CapabilitiesService } from "../capabilities/capabilities.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { validateEmailFormat } from "../purchases/purchases.helpers";
import { RedisService } from "../redis/redis.service";
import { BookingsRepository } from "./bookings.repository";
import {
  IDEMPOTENCY_TTL_SEC,
  LOCK_TTL_SEC,
  ensureId,
  hasValidTimeRange,
  isFutureDateTime,
  isPgUniqueViolation,
  lockToken,
  normalizeEmail,
  normalizeMaterials,
  normalizePhone,
  nowIso,
  toMinutes,
} from "./bookings.helpers";
import type {
  BookingDto,
  BookingRecord,
  BookingSlotHoldDto,
  BookingSlotHoldStatusResponseDto,
  BookingStatus,
  ConfirmBookingSlotHoldPayloadDto,
  CreateBookingSlotHoldPayloadDto,
  CreateBookingPayloadDto,
  UpdateBookingPatchDto,
} from "./bookings.types";

type AvailabilitySlotDto = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};

const ACTIVE_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "scheduled",
  "rescheduled",
]);

const ALLOWED_TRANSITIONS: Record<BookingStatus, ReadonlySet<BookingStatus>> = {
  scheduled: new Set(["scheduled", "rescheduled", "canceled", "completed", "no_show"]),
  rescheduled: new Set(["rescheduled", "canceled", "completed", "no_show"]),
  canceled: new Set(["canceled"]),
  completed: new Set(["completed"]),
  no_show: new Set(["no_show"]),
};

@Injectable()
export class BookingsService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly bookingsRepository: BookingsRepository,
    private readonly authRepository: AuthRepository,
    private readonly redisService: RedisService,
    @Optional()
    private readonly authService: AuthService | null = null,
    @Optional()
    private readonly capabilitiesService: CapabilitiesService | null = null
  ) {}

  async onModuleInit() {
    await this.bookingsRepository.ensureSchema();
  }

  async getBookings(params: {
    actorUser: AuthUserDto | null;
    teacherId?: string;
    studentId?: string;
  }): Promise<BookingDto[]> {
    const { actorUser } = params;
    if (!actorUser) {
      return [];
    }

    const teacherId = params.teacherId?.trim() || undefined;
    const studentId = params.studentId?.trim() || undefined;

    if (actorUser.role === "student") {
      if (studentId && studentId !== actorUser.id) {
        throw new HttpException({ error: "Недопустимый контекст записей.", code: "booking_not_owned" }, 403);
      }
      return this.bookingsRepository.findBookings({
        teacherId,
        studentId: actorUser.id,
      });
    }

    if (teacherId && teacherId !== actorUser.id) {
      throw new HttpException({ error: "Недопустимый контекст записей.", code: "booking_not_owned" }, 403);
    }

    return this.bookingsRepository.findBookings({
      teacherId: teacherId ?? actorUser.id,
      studentId,
    });
  }

  async getPublicTeacherAvailability(teacherId: string): Promise<AvailabilitySlotDto[]> {
    const normalizedTeacherId = teacherId.trim();
    if (!normalizedTeacherId) {
      throw new HttpException({ error: "teacherId обязателен.", code: "validation_failed" }, 400);
    }

    const teacher = await this.authRepository.findById(normalizedTeacherId);
    if (!teacher || teacher.role !== "teacher") {
      throw new HttpException({ error: "Преподаватель не найден.", code: "teacher_not_found" }, 404);
    }

    const slots = await this.bookingsRepository.findAvailabilityByTeacher(
      normalizedTeacherId,
      {
        futureOnly: true,
      }
    );

    return slots.map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
  }

  async getMyTeacherAvailability(
    actorUser: AuthUserDto | null
  ): Promise<AvailabilitySlotDto[]> {
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация.", code: "unauthorized" }, 401);
    }
    if (actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя.", code: "forbidden" }, 403);
    }
    const slots = await this.bookingsRepository.findAvailabilityByTeacher(actorUser.id, {
      futureOnly: true,
    });
    return slots.map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
  }

  async replaceTeacherAvailability(params: {
    actorUser: AuthUserDto | null;
    slots: Array<{
      id?: string;
      date: string;
      startTime: string;
      endTime: string;
    }>;
  }): Promise<AvailabilitySlotDto[]> {
    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация.", code: "unauthorized" }, 401);
    }
    if (actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя.", code: "forbidden" }, 403);
    }

    const normalizedSlots = this.normalizeTeacherSlots(actorUser.id, params.slots);
    const lockKey = `lock:availability:teacher:${actorUser.id}`;

    await this.withLock(lockKey, async () => {
      for (const slot of normalizedSlots) {
        const overlap = await this.bookingsRepository.findOverlappingBooking({
          teacherId: actorUser.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
        if (overlap) {
          throw new HttpException(
            {
              error:
                "Нельзя открыть слот, который пересекается с уже записанным занятием.",
              code: "slot_conflict",
            },
            409
          );
        }
      }

      await this.bookingsRepository.replaceTeacherAvailabilityAtomic({
        teacherId: actorUser.id,
        slots: normalizedSlots,
      });
    });

    const slots = await this.bookingsRepository.findAvailabilityByTeacher(actorUser.id, {
      futureOnly: true,
    });

    return slots.map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
  }

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
        await this.bookingsRepository.findIdempotentResponse<BookingSlotHoldStatusResponseDto>(
          "booking:hold:create",
          normalizedIdempotency
        );
      if (cached) return cached;
    }

    const slot = await this.bookingsRepository.findAvailabilitySlot(slotId);
    if (!slot || slot.teacherId !== teacherId) {
      throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
    }
    if (
      !hasValidTimeRange(slot.startTime, slot.endTime) ||
      !isFutureDateTime(slot.date, slot.startTime)
    ) {
      await this.bookingsRepository.removeAvailabilitySlot(slot.id);
      throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
    }

    const teacher = await this.authRepository.findById(teacherId);
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
      const existingUser = await this.authRepository.findByEmail(payloadEmail);
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
      Date.now() + this.runtimeConfig.bookingSlotHoldTtlSec * 1000
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
    await this.withLock(lockKey, async () => {
      const existingActiveHold =
        await this.bookingsRepository.findActiveSlotHoldBySlotId(slot.id);
      if (existingActiveHold && Date.parse(existingActiveHold.expiresAt) > Date.now()) {
        throw new HttpException(
          { error: "Слот уже удерживается другим запросом.", code: "slot_hold_conflict" },
          409
        );
      }
      if (existingActiveHold && Date.parse(existingActiveHold.expiresAt) <= Date.now()) {
        await this.bookingsRepository.transitionSlotHoldToReleasedAtomic({
          holdId: existingActiveHold.id,
          status: "expired",
          releasedAt: nowIso(),
        });
      }

      const created = await this.bookingsRepository.createSlotHoldWithSlotClaim({
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
      await this.bookingsRepository.saveIdempotentResponse(
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

    const hold = await this.bookingsRepository.findSlotHoldById(holdId);
    if (!hold) {
      throw new HttpException({ error: "Slot hold не найден.", code: "not_found" }, 404);
    }

    if (hold.status === "active" && Date.parse(hold.expiresAt) <= Date.now()) {
      const expired = await this.bookingsRepository.transitionSlotHoldToReleasedAtomic({
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
      const cached = await this.bookingsRepository.findIdempotentResponse<BookingDto>(
        "booking:hold:confirm",
        normalizedIdempotency
      );
      if (cached) {
        return cached;
      }
    }

    const lockKey = `lock:booking:hold:confirm:${holdId}`;
    const booking = await this.withLock(lockKey, async () => {
      const hold = await this.bookingsRepository.findSlotHoldById(holdId);
      if (!hold) {
        throw new HttpException({ error: "Slot hold не найден.", code: "not_found" }, 404);
      }

      if (hold.status === "active" && Date.parse(hold.expiresAt) <= Date.now()) {
        await this.bookingsRepository.transitionSlotHoldToReleasedAtomic({
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
        const existing = await this.bookingsRepository.findBookingBySlotId(hold.slotId);
        if (existing?.studentId === actorUser.id) {
          return existing;
        }
        throw new HttpException(
          { error: "Slot hold уже использован.", code: "slot_hold_consumed" },
          409
        );
      }

      await this.assertIdentityUsableForBooking(actorUser);

      const teacher = await this.authRepository.findById(hold.teacherId);
      if (!teacher || teacher.role !== "teacher") {
        throw new HttpException({ error: "Преподаватель не найден.", code: "teacher_not_found" }, 404);
      }

      const hasPreviousBookings = await this.bookingsRepository.hasBookingsForStudent(
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
        const confirmed = await this.bookingsRepository.confirmSlotHoldBookingAtomic({
          holdId: hold.id,
          consumedAt: createdAt,
          booking,
        });
        if (confirmed.outcome === "confirmed") {
          return booking;
        }
        if (confirmed.outcome === "consumed") {
          const existing = await this.bookingsRepository.findBookingBySlotId(hold.slotId);
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
        if (isPgUniqueViolation(error)) {
          const existing = await this.bookingsRepository.findBookingBySlotId(hold.slotId);
          if (existing?.studentId === actorUser.id) {
            return existing;
          }
          throw new HttpException({ error: "Слот уже недоступен", code: "slot_conflict" }, 409);
        }
        throw error;
      }
    });

    await this.syncBookingCapabilities(booking);

    if (normalizedIdempotency) {
      await this.bookingsRepository.saveIdempotentResponse(
        "booking:hold:confirm",
        normalizedIdempotency,
        booking,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return booking;
  }

  async createBooking(params: {
    payload: CreateBookingPayloadDto;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<BookingDto> {
    const payload = params.payload;
    const actorUser = params.actorUser;

    if (actorUser?.role === "teacher") {
      throw new HttpException(
        {
          error: "Вы сами себе лучший репетитор. Записаться как преподаватель нельзя.",
          code: "teacher_cannot_book",
        },
        403
      );
    }
    if (
      this.runtimeConfig.bookingV2Enabled &&
      !actorUser &&
      !this.runtimeConfig.bookingV2GuestCompatibilityEnabled
    ) {
      throw new HttpException(
        {
          error:
            "Для записи на индивидуальное занятие сначала создайте slot hold и завершите регистрацию.",
          code: "booking_registration_required",
          nextAction: "booking_v2_hold",
        },
        409
      );
    }

    const teacherId = payload.teacherId?.trim();
    const slotId = payload.slotId?.trim();
    if (!teacherId || !slotId) {
      throw new HttpException({ error: "teacherId и slotId обязательны.", code: "validation_failed" }, 400);
    }

    const slot = await this.bookingsRepository.findAvailabilitySlot(slotId);
    if (!slot || slot.teacherId !== teacherId) {
      throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
    }

    if (
      !hasValidTimeRange(slot.startTime, slot.endTime) ||
      !isFutureDateTime(slot.date, slot.startTime)
    ) {
      await this.bookingsRepository.removeAvailabilitySlot(slot.id);
      throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
    }

    const teacher = await this.authRepository.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") {
      throw new HttpException({ error: "Преподаватель не найден.", code: "teacher_not_found" }, 404);
    }

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.bookingsRepository.findIdempotentResponse<BookingDto>(
        "booking:create",
        normalizedIdempotency
      );
      if (cached) {
        return cached;
      }
    }

    let effectiveStudentId = "";
    let effectiveStudentEmail = "";
    let effectiveStudentFirstName = "";
    let effectiveStudentLastName = "";
    let effectiveStudentPhone: string | undefined;
    let effectiveStudentPhoto: string | undefined;
    let identityKind: BookingRecord["identityKind"] = "guest_pending";

    if (actorUser?.role === "student") {
      const payloadStudentId = payload.studentId?.trim() || undefined;
      if (payloadStudentId && payloadStudentId !== actorUser.id) {
        throw new HttpException(
          { error: "Запись можно оформить только для текущего аккаунта.", code: "identity_injection_forbidden" },
          409
        );
      }

      const payloadStudentEmail = normalizeEmail(payload.studentEmail);
      const actorEmail = normalizeEmail(actorUser.email);
      if (payloadStudentEmail && payloadStudentEmail !== actorEmail) {
        throw new HttpException(
          {
            error: "Email записи должен совпадать с авторизованным аккаунтом.",
            code: "identity_conflict_auth_required",
            nextAction: "login_and_attach",
          },
          409
        );
      }

      identityKind = "user_bound";
      effectiveStudentId = actorUser.id;
      effectiveStudentEmail = actorEmail;
      effectiveStudentFirstName = actorUser.firstName;
      effectiveStudentLastName = actorUser.lastName;
      effectiveStudentPhone = normalizePhone(actorUser.phone);
      effectiveStudentPhoto = actorUser.photo;
    } else {
      if (payload.studentId?.trim()) {
        throw new HttpException(
          {
            error: "Гостевая запись не может передавать studentId.",
            code: "identity_injection_forbidden",
          },
          400
        );
      }

      const studentEmail = normalizeEmail(payload.studentEmail);
      if (!studentEmail) {
        throw new HttpException({ error: "Email обязателен", code: "validation_failed" }, 400);
      }
      if (!validateEmailFormat(studentEmail)) {
        throw new HttpException(
          { error: "Некорректный email для записи на занятие.", code: "validation_failed" },
          400
        );
      }

      const existingUser = await this.authRepository.findByEmail(studentEmail);
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
        throw new HttpException(
          {
            error:
              "Для этого email уже существует кабинет. Войдите в аккаунт, чтобы подтвердить запись.",
            code: "identity_conflict_auth_required",
            nextAction: "login_and_attach",
          },
          409
        );
      }

      identityKind = "guest_pending";
      effectiveStudentId = ensureId("guest_student");
      effectiveStudentEmail = studentEmail;
      effectiveStudentFirstName = payload.studentFirstName?.trim() || "";
      effectiveStudentLastName = payload.studentLastName?.trim() || "";
      effectiveStudentPhone = normalizePhone(payload.studentPhone);
      effectiveStudentPhoto = payload.studentPhoto?.trim() || undefined;
    }

    const studentName =
      payload.studentName?.trim() ||
      `${effectiveStudentFirstName} ${effectiveStudentLastName}`.trim() ||
      effectiveStudentEmail;

    const overlap = await this.bookingsRepository.findOverlappingBooking({
      teacherId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
    if (overlap) {
      throw new HttpException({ error: "Слот уже недоступен", code: "slot_conflict" }, 409);
    }

    const hasPreviousBookings = await this.bookingsRepository.hasBookingsForStudent(
      effectiveStudentId
    );

    const createdAt = nowIso();
    const acceptedScopes = Array.isArray(payload.consents?.acceptedScopes)
      ? payload.consents?.acceptedScopes
          .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
          .filter((scope) => scope.length > 0)
      : [];

    const booking: BookingRecord = {
      id: ensureId("booking"),
      slotId: slot.id,
      teacherId,
      teacherName: payload.teacherName?.trim() || `${teacher.firstName} ${teacher.lastName}`.trim(),
      teacherPhoto: payload.teacherPhoto?.trim() || teacher.photo,
      studentId: effectiveStudentId,
      studentName,
      studentEmail: effectiveStudentEmail,
      studentPhone: effectiveStudentPhone,
      studentPhoto: effectiveStudentPhoto,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      lessonKind: hasPreviousBookings ? "regular" : "trial",
      status: "scheduled",
      paymentStatus: "unpaid",
      meetingUrl: "",
      materials: [],
      consentSnapshot:
        acceptedScopes.length > 0
          ? {
              acceptedScopes,
              source: actorUser ? "student_booking" : "public_booking",
              acceptedAt: createdAt,
            }
          : undefined,
      identityKind,
      identityEmailCanonical: normalizeEmail(effectiveStudentEmail),
      createdAt,
    };

    const lockKey = `lock:booking:create:slot:${slot.id}`;
    await this.withLock(lockKey, async () => {
      try {
        const created = await this.bookingsRepository.createBookingWithSlotClaim({
          booking,
          slotId: slot.id,
        });
        if (!created) {
          throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
        }
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          throw new HttpException({ error: "Слот уже недоступен", code: "slot_conflict" }, 409);
        }
        throw error;
      }
    });

    if (normalizedIdempotency) {
      await this.bookingsRepository.saveIdempotentResponse(
        "booking:create",
        normalizedIdempotency,
        booking,
        IDEMPOTENCY_TTL_SEC
      );
    }

    await this.syncBookingCapabilities(booking);

    return booking;
  }

  async updateBooking(params: {
    bookingId: string;
    patch: UpdateBookingPatchDto;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<BookingDto> {
    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация.", code: "unauthorized" }, 401);
    }

    const bookingId = params.bookingId.trim();
    if (!bookingId) {
      throw new HttpException({ error: "bookingId обязателен.", code: "validation_failed" }, 400);
    }

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.bookingsRepository.findIdempotentResponse<BookingDto>(
        "booking:update",
        normalizedIdempotency
      );
      if (cached) {
        return cached;
      }
    }

    const lockKey = `lock:booking:update:${bookingId}`;
    const result = await this.withLock(lockKey, async () => {
      const existing = await this.bookingsRepository.findBookingById(bookingId);
      if (!existing) {
        throw new HttpException({ error: "Booking not found", code: "not_found" }, 404);
      }

      const canManageAsTeacher =
        actorUser.role === "teacher" && existing.teacherId === actorUser.id;
      const canManageAsStudent =
        actorUser.role === "student" && existing.studentId === actorUser.id;

      if (!canManageAsTeacher && !canManageAsStudent) {
        throw new HttpException({ error: "Недопустимое изменение записи.", code: "booking_not_owned" }, 403);
      }

      const patch = params.patch;

      if (
        canManageAsStudent &&
        (patch.paymentStatus !== undefined ||
          patch.meetingUrl !== undefined ||
          patch.materials !== undefined ||
          patch.status !== undefined)
      ) {
        throw new HttpException(
          {
            error:
              "Ученик может только перенести или отменить занятие. Материалы и статус изменяет преподаватель.",
            code: "forbidden",
          },
          403
        );
      }

      if (!ACTIVE_BOOKING_STATUSES.has(existing.status) && patch.reschedule?.slotId?.trim()) {
        throw new HttpException(
          {
            error: "Перенос доступен только для активных записей.",
            code: "invalid_state_transition",
          },
          409
        );
      }

      let nextStatus = existing.status;
      if (patch.status) {
        if (!canManageAsTeacher) {
          throw new HttpException({ error: "Недопустимая смена статуса.", code: "forbidden" }, 403);
        }
        if (!ALLOWED_TRANSITIONS[existing.status].has(patch.status)) {
          throw new HttpException(
            {
              error: "Недопустимый переход статуса записи.",
              code: "invalid_state_transition",
            },
            409
          );
        }
        nextStatus = patch.status;
      }

      let next: BookingRecord = {
        ...existing,
        status: nextStatus,
        canceledAt: nextStatus === "canceled" ? nowIso() : existing.canceledAt,
        paymentStatus:
          patch.paymentStatus === "paid" || patch.paymentStatus === "unpaid"
            ? patch.paymentStatus
            : existing.paymentStatus,
        meetingUrl:
          typeof patch.meetingUrl === "string"
            ? patch.meetingUrl
            : existing.meetingUrl,
        materials:
          patch.materials !== undefined
            ? normalizeMaterials(patch.materials)
            : existing.materials,
      };

      const rescheduleSlotId = patch.reschedule?.slotId?.trim();
      if (rescheduleSlotId) {
        const nextSlot = await this.bookingsRepository.findAvailabilitySlot(
          rescheduleSlotId
        );
        if (!nextSlot || nextSlot.teacherId !== existing.teacherId) {
          throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
        }
        if (
          !hasValidTimeRange(nextSlot.startTime, nextSlot.endTime) ||
          !isFutureDateTime(nextSlot.date, nextSlot.startTime)
        ) {
          await this.bookingsRepository.removeAvailabilitySlot(nextSlot.id);
          throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
        }

        const overlap = await this.bookingsRepository.findOverlappingBooking({
          teacherId: existing.teacherId,
          date: nextSlot.date,
          startTime: nextSlot.startTime,
          endTime: nextSlot.endTime,
          excludeBookingId: existing.id,
        });
        if (overlap) {
          throw new HttpException({ error: "Слот уже недоступен", code: "slot_conflict" }, 409);
        }

        const shouldRestorePrevious =
          hasValidTimeRange(existing.startTime, existing.endTime) &&
          isFutureDateTime(existing.date, existing.startTime);

        next = {
          ...next,
          status: "rescheduled",
          slotId: nextSlot.id,
          date: nextSlot.date,
          startTime: nextSlot.startTime,
          endTime: nextSlot.endTime,
          canceledAt: undefined,
        };

        try {
          const updated = await this.bookingsRepository.rescheduleBookingAtomic({
            booking: next,
            nextSlotId: nextSlot.id,
            restorePreviousSlot: shouldRestorePrevious
              ? {
                  id: ensureId("slot"),
                  teacherId: existing.teacherId,
                  date: existing.date,
                  startTime: existing.startTime,
                  endTime: existing.endTime,
                }
              : undefined,
          });
          if (!updated) {
            throw new HttpException({ error: "Слот уже недоступен", code: "slot_no_longer_available" }, 409);
          }
        } catch (error) {
          if (isPgUniqueViolation(error)) {
            throw new HttpException({ error: "Слот уже недоступен", code: "slot_conflict" }, 409);
          }
          throw error;
        }

        return next;
      }

      try {
        await this.bookingsRepository.updateBooking(next);
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          throw new HttpException({ error: "Слот уже недоступен", code: "slot_conflict" }, 409);
        }
        throw error;
      }
      return next;
    });

    if (normalizedIdempotency) {
      await this.bookingsRepository.saveIdempotentResponse(
        "booking:update",
        normalizedIdempotency,
        result,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return result;
  }

  async deleteBooking(params: {
    bookingId: string;
    actorUser: AuthUserDto | null;
    idempotencyKey?: string;
  }): Promise<{ id: string }> {
    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация.", code: "unauthorized" }, 401);
    }

    const bookingId = params.bookingId.trim();
    if (!bookingId) {
      throw new HttpException({ error: "bookingId обязателен.", code: "validation_failed" }, 400);
    }

    const normalizedIdempotency = params.idempotencyKey?.trim();
    if (normalizedIdempotency) {
      const cached = await this.bookingsRepository.findIdempotentResponse<{ id: string }>(
        "booking:delete",
        normalizedIdempotency
      );
      if (cached) {
        return cached;
      }
    }

    const lockKey = `lock:booking:delete:${bookingId}`;
    const result = await this.withLock(lockKey, async () => {
      const existing = await this.bookingsRepository.findBookingById(bookingId);
      if (!existing) {
        return { id: bookingId };
      }

      const canDeleteAsTeacher =
        actorUser.role === "teacher" && existing.teacherId === actorUser.id;
      const canDeleteAsStudent =
        actorUser.role === "student" && existing.studentId === actorUser.id;

      if (!canDeleteAsTeacher && !canDeleteAsStudent) {
        throw new HttpException({ error: "Недопустимая отмена записи.", code: "booking_not_owned" }, 403);
      }

      if (existing.status === "canceled") {
        return { id: existing.id };
      }

      if (!ACTIVE_BOOKING_STATUSES.has(existing.status)) {
        throw new HttpException(
          {
            error: "Отменить можно только активную запись.",
            code: "invalid_state_transition",
          },
          409
        );
      }

      const shouldRestoreSlot =
        hasValidTimeRange(existing.startTime, existing.endTime) &&
        isFutureDateTime(existing.date, existing.startTime);

      const canceled = await this.bookingsRepository.deleteBookingAtomic({
        bookingId: existing.id,
        canceledAt: nowIso(),
        restorePreviousSlot: shouldRestoreSlot
          ? {
              id: existing.slotId ?? ensureId("slot"),
              teacherId: existing.teacherId,
              date: existing.date,
              startTime: existing.startTime,
              endTime: existing.endTime,
            }
          : undefined,
      });

      if (!canceled) {
        throw new HttpException(
          {
            error: "Отменить запись не удалось: статус уже изменен.",
            code: "invalid_state_transition",
          },
          409
        );
      }
      return { id: existing.id };
    });

    if (normalizedIdempotency) {
      await this.bookingsRepository.saveIdempotentResponse(
        "booking:delete",
        normalizedIdempotency,
        result,
        IDEMPOTENCY_TTL_SEC
      );
    }

    return result;
  }

  private assertBookingV2Enabled() {
    if (!this.runtimeConfig.bookingV2Enabled) {
      throw new HttpException(
        { error: "Booking v2 flow отключен в текущем runtime.", code: "booking_v2_disabled" },
        404
      );
    }
  }

  private async assertIdentityUsableForBooking(
    actorUser: AuthUserDto
  ): Promise<void> {
    if (!this.authService) {
      return;
    }
    try {
      const completion = await this.authService.getIdentityCompletionStatus(actorUser.id);
      if (completion.completionState === "completed") {
        return;
      }
      throw new HttpException(
        {
          error: "Перед подтверждением записи завершите регистрацию аккаунта.",
          code: "identity_completion_required",
          nextAction:
            completion.completionState === "pending_first_password"
              ? "set_first_password"
              : "complete_registration",
        },
        409
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
    }
  }

  private async syncBookingCapabilities(booking: BookingRecord): Promise<void> {
    if (booking.identityKind !== "user_bound") {
      return;
    }
    if (!this.capabilitiesService) {
      return;
    }
    try {
      await this.capabilitiesService.grantBookingInteractionCapabilities({
        userId: booking.studentId,
        bookingId: booking.id,
        teacherId: booking.teacherId,
        grantedAt: booking.createdAt,
      });
    } catch (error) {
      this.logger.warn(
        `booking capability grants sync failed for booking=${booking.id}, student=${booking.studentId}: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  private normalizeTeacherSlots(
    teacherId: string,
    rawSlots: Array<{ id?: string; date: string; startTime: string; endTime: string }>
  ) {
    const normalized = rawSlots
      .map((slot) => ({
        id: slot.id?.trim() || ensureId("slot"),
        teacherId,
        date: slot.date?.trim() || "",
        startTime: slot.startTime?.trim() || "",
        endTime: slot.endTime?.trim() || "",
      }))
      .filter((slot) => slot.date && slot.startTime && slot.endTime);

    for (const slot of normalized) {
      if (!hasValidTimeRange(slot.startTime, slot.endTime)) {
        throw new HttpException(
          { error: "Диапазон времени слота некорректен.", code: "validation_failed" },
          400
        );
      }
      if (!isFutureDateTime(slot.date, slot.startTime)) {
        throw new HttpException(
          {
            error: "Можно сохранять только будущие слоты.",
            code: "validation_failed",
          },
          400
        );
      }
    }

    const collisions = new Set<string>();
    for (let i = 0; i < normalized.length; i += 1) {
      const current = normalized[i];
      const currentStart = toMinutes(current.startTime);
      const currentEnd = toMinutes(current.endTime);
      for (let j = i + 1; j < normalized.length; j += 1) {
        const next = normalized[j];
        if (current.date !== next.date) continue;
        const nextStart = toMinutes(next.startTime);
        const nextEnd = toMinutes(next.endTime);
        if (currentStart < nextEnd && nextStart < currentEnd) {
          collisions.add(current.date);
        }
      }
    }

    if (collisions.size > 0) {
      throw new HttpException(
        {
          error: "Слоты не должны пересекаться в рамках одного дня.",
          code: "slot_conflict",
        },
        409
      );
    }

    return normalized;
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const token = lockToken();
    const acquired = await this.redisService.setIfAbsent(key, token, LOCK_TTL_SEC);
    if (!acquired) {
      throw new HttpException(
        {
          error: "Похожий запрос уже обрабатывается. Повторите через несколько секунд.",
          code: "request_in_progress",
        },
        409
      );
    }
    try {
      return await operation();
    } finally {
      await this.redisService.releaseLock(key, token);
    }
  }
}
