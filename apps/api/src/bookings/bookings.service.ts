import crypto from "node:crypto";
import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { AuthRepository } from "../auth/auth.repository";
import { RedisService } from "../redis/redis.service";
import { BookingsRepository } from "./bookings.repository";
import type {
  BookingDto,
  BookingMaterialDto,
  BookingRecord,
  CreateBookingPayloadDto,
  UpdateBookingPatchDto,
} from "./bookings.types";

const IDEMPOTENCY_TTL_SEC = 12 * 60 * 60;
const LOCK_TTL_SEC = 15;

const nowIso = () => new Date().toISOString();

const ensureId = (prefix: string) => {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeEmail = (value: string | undefined | null) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizePhone = (value: string | undefined | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toMinutes = (value: string) => {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;
  return hours * 60 + minutes;
};

const hasValidTimeRange = (startTime: string, endTime: string) => {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
};

const toStartTimestamp = (date: string, startTime: string) =>
  new Date(`${date}T${startTime}`).getTime();

const isFutureDateTime = (date: string, startTime: string) => {
  const timestamp = toStartTimestamp(date, startTime);
  return Number.isFinite(timestamp) && timestamp > Date.now();
};

const normalizeMaterials = (value: unknown): BookingMaterialDto[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      const type =
        raw.type === "pdf" || raw.type === "doc" || raw.type === "video"
          ? raw.type
          : null;
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      if (!id || !name || !type || !url) return null;
      return { id, name, type, url } as BookingMaterialDto;
    })
    .filter((item): item is BookingMaterialDto => Boolean(item));
};

const asErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
};

const isPgUniqueViolation = (error: unknown) => asErrorCode(error) === "23505";

const lockToken = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

@Injectable()
export class BookingsService implements OnModuleInit {
  constructor(
    private readonly bookingsRepository: BookingsRepository,
    private readonly authRepository: AuthRepository,
    private readonly redisService: RedisService
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
        throw new HttpException({ error: "Недопустимый контекст записей." }, 403);
      }
      return this.bookingsRepository.findBookings({
        teacherId,
        studentId: actorUser.id,
      });
    }

    if (teacherId && teacherId !== actorUser.id) {
      throw new HttpException({ error: "Недопустимый контекст записей." }, 403);
    }

    return this.bookingsRepository.findBookings({
      teacherId: teacherId ?? actorUser.id,
      studentId,
    });
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
          error:
            "Вы сами себе лучший репетитор. Записаться как преподаватель нельзя.",
        },
        403
      );
    }

    const teacherId = payload.teacherId?.trim();
    const slotId = payload.slotId?.trim();
    if (!teacherId || !slotId) {
      throw new HttpException({ error: "teacherId и slotId обязательны." }, 400);
    }

    const slot = await this.bookingsRepository.findAvailabilitySlot(slotId);
    if (!slot || slot.teacherId !== teacherId) {
      throw new HttpException({ error: "Слот уже недоступен" }, 409);
    }

    if (
      !hasValidTimeRange(slot.startTime, slot.endTime) ||
      !isFutureDateTime(slot.date, slot.startTime)
    ) {
      await this.bookingsRepository.removeAvailabilitySlot(slot.id);
      throw new HttpException({ error: "Слот уже недоступен" }, 409);
    }

    const teacher = await this.authRepository.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") {
      throw new HttpException({ error: "Преподаватель не найден." }, 404);
    }

    let studentId = payload.studentId?.trim() || undefined;
    let studentEmail = normalizeEmail(payload.studentEmail);
    let studentFirstName = payload.studentFirstName?.trim() || "";
    let studentLastName = payload.studentLastName?.trim() || "";
    let studentPhone = normalizePhone(payload.studentPhone);
    let studentPhoto = payload.studentPhoto?.trim() || undefined;

    if (actorUser?.role === "student") {
      if (studentId && studentId !== actorUser.id) {
        throw new HttpException(
          { error: "Запись можно оформить только для текущего аккаунта." },
          409
        );
      }
      if (studentEmail && studentEmail !== normalizeEmail(actorUser.email)) {
        throw new HttpException(
          {
            error:
              "Email записи должен совпадать с авторизованным аккаунтом.",
          },
          409
        );
      }

      studentId = actorUser.id;
      studentEmail = normalizeEmail(actorUser.email);
      studentFirstName = actorUser.firstName;
      studentLastName = actorUser.lastName;
      studentPhone = normalizePhone(actorUser.phone);
      studentPhoto = actorUser.photo;
    }

    if (!studentEmail) {
      throw new HttpException({ error: "Email обязателен" }, 400);
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

    const studentUser =
      (studentId ? await this.authRepository.findById(studentId) : null) ??
      (await this.authRepository.findByEmail(studentEmail));

    if (studentUser && studentUser.role === "teacher") {
      throw new HttpException(
        {
          error:
            "Этот email принадлежит преподавателю. Используйте email ученика.",
        },
        400
      );
    }

    const effectiveStudentId = studentUser?.id ?? studentId ?? ensureId("guest_student");
    const effectiveStudentEmail = studentUser?.email ?? studentEmail;
    const effectiveStudentFirstName = studentUser?.firstName ?? studentFirstName;
    const effectiveStudentLastName = studentUser?.lastName ?? studentLastName;
    const effectiveStudentPhone = normalizePhone(studentUser?.phone) ?? studentPhone;
    const effectiveStudentPhoto = studentUser?.photo ?? studentPhoto;
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
      throw new HttpException({ error: "Слот уже недоступен" }, 409);
    }

    const hasPreviousBookings = await this.bookingsRepository.hasBookingsForStudent(
      effectiveStudentId
    );

    const createdAt = nowIso();
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
      paymentStatus: "unpaid",
      meetingUrl: "",
      materials: [],
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
          throw new HttpException({ error: "Слот уже недоступен" }, 409);
        }
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          throw new HttpException({ error: "Слот уже недоступен" }, 409);
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
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const bookingId = params.bookingId.trim();
    if (!bookingId) {
      throw new HttpException({ error: "bookingId обязателен." }, 400);
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
        throw new HttpException({ error: "Booking not found" }, 404);
      }

      const canManageAsTeacher =
        actorUser.role === "teacher" && existing.teacherId === actorUser.id;
      const canManageAsStudent =
        actorUser.role === "student" && existing.studentId === actorUser.id;

      if (!canManageAsTeacher && !canManageAsStudent) {
        throw new HttpException({ error: "Недопустимое изменение записи." }, 403);
      }

      const patch = params.patch;

      if (
        canManageAsStudent &&
        (patch.paymentStatus !== undefined ||
          patch.meetingUrl !== undefined ||
          patch.materials !== undefined)
      ) {
        throw new HttpException(
          {
            error:
              "Ученик может только перенести или отменить занятие. Материалы и статус оплаты изменяет преподаватель.",
          },
          403
        );
      }

      let next: BookingRecord = {
        ...existing,
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
          throw new HttpException({ error: "Слот уже недоступен" }, 409);
        }
        if (
          !hasValidTimeRange(nextSlot.startTime, nextSlot.endTime) ||
          !isFutureDateTime(nextSlot.date, nextSlot.startTime)
        ) {
          await this.bookingsRepository.removeAvailabilitySlot(nextSlot.id);
          throw new HttpException({ error: "Слот уже недоступен" }, 409);
        }

        const overlap = await this.bookingsRepository.findOverlappingBooking({
          teacherId: existing.teacherId,
          date: nextSlot.date,
          startTime: nextSlot.startTime,
          endTime: nextSlot.endTime,
          excludeBookingId: existing.id,
        });
        if (overlap) {
          throw new HttpException({ error: "Слот уже недоступен" }, 409);
        }

        const shouldRestorePrevious =
          hasValidTimeRange(existing.startTime, existing.endTime) &&
          isFutureDateTime(existing.date, existing.startTime);

        next = {
          ...next,
          slotId: nextSlot.id,
          date: nextSlot.date,
          startTime: nextSlot.startTime,
          endTime: nextSlot.endTime,
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
            throw new HttpException({ error: "Слот уже недоступен" }, 409);
          }
        } catch (error) {
          if (isPgUniqueViolation(error)) {
            throw new HttpException({ error: "Слот уже недоступен" }, 409);
          }
          throw error;
        }

        return next;
      }

      try {
        await this.bookingsRepository.updateBooking(next);
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          throw new HttpException({ error: "Слот уже недоступен" }, 409);
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
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const bookingId = params.bookingId.trim();
    if (!bookingId) {
      throw new HttpException({ error: "bookingId обязателен." }, 400);
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
        throw new HttpException({ error: "Недопустимое удаление записи." }, 403);
      }

      const shouldRestoreSlot =
        hasValidTimeRange(existing.startTime, existing.endTime) &&
        isFutureDateTime(existing.date, existing.startTime);

      const deleted = await this.bookingsRepository.deleteBookingAtomic({
        bookingId: existing.id,
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

      if (!deleted) {
        return { id: bookingId };
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
