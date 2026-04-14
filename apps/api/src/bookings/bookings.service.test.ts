import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { BookingsService } from "./bookings.service";
import type { BookingRecord } from "./bookings.types";

let envSnapshot: Record<string, string | undefined> = {};

test.beforeEach(() => {
  envSnapshot = { ...process.env };
  process.env.APP_ENV = process.env.APP_ENV || "local";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgres://u:p@127.0.0.1:5432/db";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
});

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

const futureDate = () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return future.toISOString().slice(0, 10);
};

const withBookingV2Env = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>
) => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "local";
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
    process.env.BOOKING_V2_ENABLED = "true";
    process.env.BOOKING_V2_GUEST_COMPAT_ENABLED = "true";
    process.env.BOOKING_SLOT_HOLD_TTL_SEC = "900";

    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    await run();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const buildBaseRepository = () => {
  const date = futureDate();
  const captured: { booking?: BookingRecord } = {};
  const repository = {
    ensureSchema: async () => undefined,
    findBookings: async () => [],
    findAvailabilityByTeacher: async () => [],
    replaceTeacherAvailabilityAtomic: async () => undefined,
    findAvailabilitySlot: async () => ({
      id: "slot_1",
      teacherId: "teacher_1",
      date,
      startTime: "10:00",
      endTime: "11:00",
    }),
    removeAvailabilitySlot: async () => undefined,
    findIdempotentResponse: async () => null,
    findOverlappingBooking: async () => null,
    hasBookingsForStudent: async () => false,
    createBookingWithSlotClaim: async (params: { booking: BookingRecord }) => {
      captured.booking = params.booking;
      return true;
    },
    saveIdempotentResponse: async () => undefined,
    findBookingById: async () => null,
    rescheduleBookingAtomic: async () => true,
    updateBooking: async () => undefined,
    deleteBookingAtomic: async () => true,
  };
  return { repository, captured, date };
};

test("bookings: create rejects guest payload with studentId injection", async () => {
  const { repository, date } = buildBaseRepository();
  const authRepository = {
    findById: async () => ({
      id: "teacher_1",
      email: "teacher@example.com",
      firstName: "Teacher",
      lastName: "One",
      role: "teacher",
    }),
    findByEmail: async () => null,
  };
  const redisService = {
    setIfAbsent: async () => true,
    releaseLock: async () => undefined,
  };

  const service = new BookingsService(
    repository as never,
    authRepository as never,
    redisService as never
  );

  await assert.rejects(
    () =>
      service.createBooking({
        payload: {
          teacherId: "teacher_1",
          teacherName: "Teacher One",
          slotId: "slot_1",
          studentId: "student_foreign",
          studentEmail: "guest@example.com",
          date,
          startTime: "10:00",
          endTime: "11:00",
        },
        actorUser: null,
      }),
    (error: unknown) => {
      if (!(error instanceof HttpException)) return false;
      if (error.getStatus() !== 400) return false;
      const response = error.getResponse() as { code?: string };
      return response.code === "identity_injection_forbidden";
    }
  );
});

test("bookings: existing user email in guest flow returns auth-required conflict", async () => {
  const { repository, date } = buildBaseRepository();
  const authRepository = {
    findById: async () => ({
      id: "teacher_1",
      email: "teacher@example.com",
      firstName: "Teacher",
      lastName: "One",
      role: "teacher",
    }),
    findByEmail: async (email: string) =>
      email === "student@example.com"
        ? {
            id: "student_1",
            email: "student@example.com",
            firstName: "Student",
            lastName: "One",
            role: "student",
          }
        : null,
  };
  const redisService = {
    setIfAbsent: async () => true,
    releaseLock: async () => undefined,
  };

  const service = new BookingsService(
    repository as never,
    authRepository as never,
    redisService as never
  );

  await assert.rejects(
    () =>
      service.createBooking({
        payload: {
          teacherId: "teacher_1",
          teacherName: "Teacher One",
          slotId: "slot_1",
          studentEmail: "student@example.com",
          date,
          startTime: "10:00",
          endTime: "11:00",
        },
        actorUser: null,
      }),
    (error: unknown) => {
      if (!(error instanceof HttpException)) return false;
      if (error.getStatus() !== 409) return false;
      const response = error.getResponse() as { code?: string; nextAction?: string };
      return (
        response.code === "identity_conflict_auth_required" &&
        response.nextAction === "login_and_attach"
      );
    }
  );
});

test("bookings: authenticated student booking binds to session principal", async () => {
  const { repository, captured, date } = buildBaseRepository();
  const authRepository = {
    findById: async (id: string) =>
      id === "teacher_1"
        ? {
            id: "teacher_1",
            email: "teacher@example.com",
            firstName: "Teacher",
            lastName: "One",
            role: "teacher",
          }
        : null,
    findByEmail: async () => null,
  };
  const redisService = {
    setIfAbsent: async () => true,
    releaseLock: async () => undefined,
  };

  const service = new BookingsService(
    repository as never,
    authRepository as never,
    redisService as never
  );

  const result = await service.createBooking({
    payload: {
      teacherId: "teacher_1",
      teacherName: "Teacher One",
      slotId: "slot_1",
      studentEmail: "student@example.com",
      date,
      startTime: "10:00",
      endTime: "11:00",
    },
    actorUser: {
      id: "student_1",
      email: "student@example.com",
      firstName: "Student",
      lastName: "One",
      role: "student",
      phone: "+79990000000",
      photo: "",
    },
  });

  assert.equal(result.studentId, "student_1");
  assert.equal(result.status, "scheduled");
  assert.equal(captured.booking?.identityKind, "user_bound");
});

test("bookings: create rejects already occupied slot with 409 conflict", async () => {
  const date = futureDate();

  const bookingsRepository = {
    findAvailabilitySlot: async () => ({
      id: "slot_1",
      teacherId: "teacher_1",
      date,
      startTime: "10:00",
      endTime: "11:00",
    }),
    removeAvailabilitySlot: async () => undefined,
    findIdempotentResponse: async () => null,
    findOverlappingBooking: async () => ({
      id: "booking_existing",
      teacherId: "teacher_1",
      date,
      startTime: "10:00",
      endTime: "11:00",
      lessonKind: "regular",
      status: "scheduled",
      paymentStatus: "unpaid",
      meetingUrl: "",
      materials: [],
      createdAt: new Date().toISOString(),
      studentId: "student_existing",
      studentName: "Student Existing",
      studentEmail: "student@example.com",
      identityKind: "user_bound",
      identityEmailCanonical: "student@example.com",
    }),
    hasBookingsForStudent: async () => false,
  };

  const authRepository = {
    findById: async () => ({
      id: "teacher_1",
      email: "teacher@example.com",
      firstName: "Teacher",
      lastName: "One",
      role: "teacher",
    }),
    findByEmail: async () => null,
  };

  const redisService = {
    setIfAbsent: async () => true,
    releaseLock: async () => undefined,
  };

  const service = new BookingsService(
    bookingsRepository as never,
    authRepository as never,
    redisService as never
  );

  await assert.rejects(
    () =>
      service.createBooking({
        payload: {
          teacherId: "teacher_1",
          teacherName: "Teacher One",
          slotId: "slot_1",
          studentEmail: "newstudent@example.com",
          date,
          startTime: "10:00",
          endTime: "11:00",
        },
        actorUser: null,
      }),
    (error: unknown) => {
      if (!(error instanceof HttpException)) return false;
      return error.getStatus() === 409;
    }
  );
});

test("bookings: slot claim race returns deterministic 409 conflict", async () => {
  const date = futureDate();
  let claimAttempts = 0;

  const bookingsRepository = {
    findAvailabilitySlot: async () => ({
      id: "slot_1",
      teacherId: "teacher_1",
      date,
      startTime: "10:00",
      endTime: "11:00",
    }),
    removeAvailabilitySlot: async () => undefined,
    findIdempotentResponse: async () => null,
    findOverlappingBooking: async () => null,
    hasBookingsForStudent: async () => false,
    createBookingWithSlotClaim: async () => {
      claimAttempts += 1;
      return claimAttempts === 1;
    },
    saveIdempotentResponse: async () => undefined,
  };

  const authRepository = {
    findById: async () => ({
      id: "teacher_1",
      email: "teacher@example.com",
      firstName: "Teacher",
      lastName: "One",
      role: "teacher",
    }),
    findByEmail: async () => null,
  };

  const redisService = {
    setIfAbsent: async () => true,
    releaseLock: async () => undefined,
  };

  const service = new BookingsService(
    bookingsRepository as never,
    authRepository as never,
    redisService as never
  );

  await service.createBooking({
    payload: {
      teacherId: "teacher_1",
      teacherName: "Teacher One",
      slotId: "slot_1",
      studentEmail: "first@example.com",
      studentFirstName: "First",
      studentLastName: "User",
      studentPhone: "+79990000000",
      date,
      startTime: "10:00",
      endTime: "11:00",
    },
    actorUser: null,
  });

  await assert.rejects(
    () =>
      service.createBooking({
        payload: {
          teacherId: "teacher_1",
          teacherName: "Teacher One",
          slotId: "slot_1",
          studentEmail: "second@example.com",
          studentFirstName: "Second",
          studentLastName: "User",
          studentPhone: "+79990000001",
          date,
          startTime: "10:00",
          endTime: "11:00",
        },
        actorUser: null,
      }),
    (error: unknown) => {
      if (!(error instanceof HttpException)) return false;
      if (error.getStatus() !== 409) return false;
      const response = error.getResponse() as { code?: string };
      return response.code === "slot_no_longer_available";
    }
  );
});

test("bookings: delete transitions booking to canceled instead of destructive delete", async () => {
  let canceledCalls = 0;
  const bookingsRepository = {
    findIdempotentResponse: async () => null,
    findBookingById: async () => ({
      id: "booking_1",
      slotId: "slot_1",
      teacherId: "teacher_1",
      teacherName: "Teacher One",
      studentId: "student_1",
      studentName: "Student One",
      studentEmail: "student@example.com",
      date: futureDate(),
      startTime: "12:00",
      endTime: "13:00",
      lessonKind: "regular",
      status: "scheduled",
      paymentStatus: "unpaid",
      meetingUrl: "",
      materials: [],
      identityKind: "user_bound",
      identityEmailCanonical: "student@example.com",
      createdAt: new Date().toISOString(),
    }),
    deleteBookingAtomic: async () => {
      canceledCalls += 1;
      return true;
    },
    saveIdempotentResponse: async () => undefined,
  };
  const authRepository = {
    findById: async () => null,
    findByEmail: async () => null,
  };
  const redisService = {
    setIfAbsent: async () => true,
    releaseLock: async () => undefined,
  };

  const service = new BookingsService(
    bookingsRepository as never,
    authRepository as never,
    redisService as never
  );

  const result = await service.deleteBooking({
    bookingId: "booking_1",
    actorUser: {
      id: "student_1",
      email: "student@example.com",
      firstName: "Student",
      lastName: "One",
      role: "student",
      phone: "",
      photo: "",
    },
  });

  assert.equal(result.id, "booking_1");
  assert.equal(canceledCalls, 1);
});

test("bookings: reschedule updates lifecycle status and claims new slot", async () => {
  const today = futureDate();
  const tomorrow = futureDate();
  let rescheduledBooking: BookingRecord | null = null;
  const bookingsRepository = {
    findIdempotentResponse: async () => null,
    findBookingById: async () => ({
      id: "booking_1",
      slotId: "slot_1",
      teacherId: "teacher_1",
      teacherName: "Teacher One",
      studentId: "student_1",
      studentName: "Student One",
      studentEmail: "student@example.com",
      date: today,
      startTime: "12:00",
      endTime: "13:00",
      lessonKind: "regular",
      status: "scheduled",
      paymentStatus: "unpaid",
      meetingUrl: "",
      materials: [],
      identityKind: "user_bound",
      identityEmailCanonical: "student@example.com",
      createdAt: new Date().toISOString(),
    }),
    findAvailabilitySlot: async () => ({
      id: "slot_2",
      teacherId: "teacher_1",
      date: tomorrow,
      startTime: "14:00",
      endTime: "15:00",
    }),
    removeAvailabilitySlot: async () => undefined,
    findOverlappingBooking: async () => null,
    rescheduleBookingAtomic: async (params: { booking: BookingRecord }) => {
      rescheduledBooking = params.booking;
      return true;
    },
    updateBooking: async () => undefined,
    saveIdempotentResponse: async () => undefined,
  };
  const authRepository = {
    findById: async () => null,
    findByEmail: async () => null,
  };
  const redisService = {
    setIfAbsent: async () => true,
    releaseLock: async () => undefined,
  };

  const service = new BookingsService(
    bookingsRepository as never,
    authRepository as never,
    redisService as never
  );

  const result = await service.updateBooking({
    bookingId: "booking_1",
    patch: {
      reschedule: {
        slotId: "slot_2",
      },
    },
    actorUser: {
      id: "student_1",
      email: "student@example.com",
      firstName: "Student",
      lastName: "One",
      role: "student",
      phone: "",
      photo: "",
    },
  });

  assert.equal(result.status, "rescheduled");
  assert.equal(result.startTime, "14:00");
  assert.ok(rescheduledBooking);
  const capturedBooking = rescheduledBooking as BookingRecord;
  assert.equal(capturedBooking.status, "rescheduled");
  assert.equal(capturedBooking.slotId, "slot_2");
});

test("bookings v2: create slot hold succeeds and requires registration completion", async () => {
  await withBookingV2Env({}, async () => {
    const date = futureDate();
    const bookingsRepository = {
      ensureSchema: async () => undefined,
      findIdempotentResponse: async () => null,
      findAvailabilitySlot: async () => ({
        id: "slot_1",
        teacherId: "teacher_1",
        date,
        startTime: "10:00",
        endTime: "11:00",
      }),
      removeAvailabilitySlot: async () => undefined,
      findActiveSlotHoldBySlotId: async () => null,
      createSlotHoldWithSlotClaim: async () => true,
      saveIdempotentResponse: async () => undefined,
    };
    const authRepository = {
      findById: async () => ({
        id: "teacher_1",
        email: "teacher@example.com",
        firstName: "Teacher",
        lastName: "One",
        role: "teacher",
      }),
      findByEmail: async () => null,
    };
    const redisService = {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    };

    const service = new BookingsService(
      bookingsRepository as never,
      authRepository as never,
      redisService as never
    );

    const hold = await service.createSlotHold({
      payload: {
        teacherId: "teacher_1",
        slotId: "slot_1",
        studentEmail: "newstudent@example.com",
      },
      actorUser: null,
    });

    assert.equal(hold.ok, true);
    assert.equal(hold.hold.status, "active");
    assert.equal(hold.canConfirm, false);
    assert.equal(hold.nextAction, "complete_registration");
  });
});

test("bookings v2: existing account email on hold returns login-required next action", async () => {
  await withBookingV2Env({}, async () => {
    const date = futureDate();
    const bookingsRepository = {
      ensureSchema: async () => undefined,
      findIdempotentResponse: async () => null,
      findAvailabilitySlot: async () => ({
        id: "slot_1",
        teacherId: "teacher_1",
        date,
        startTime: "10:00",
        endTime: "11:00",
      }),
      removeAvailabilitySlot: async () => undefined,
      findActiveSlotHoldBySlotId: async () => null,
      createSlotHoldWithSlotClaim: async () => true,
      saveIdempotentResponse: async () => undefined,
    };
    const authRepository = {
      findById: async () => ({
        id: "teacher_1",
        email: "teacher@example.com",
        firstName: "Teacher",
        lastName: "One",
        role: "teacher",
      }),
      findByEmail: async (email: string) =>
        email === "student@example.com"
          ? {
              id: "student_1",
              email: "student@example.com",
              firstName: "Student",
              lastName: "One",
              role: "student",
            }
          : null,
    };
    const redisService = {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    };

    const service = new BookingsService(
      bookingsRepository as never,
      authRepository as never,
      redisService as never
    );

    const hold = await service.createSlotHold({
      payload: {
        teacherId: "teacher_1",
        slotId: "slot_1",
        studentEmail: "student@example.com",
      },
      actorUser: null,
    });

    assert.equal(hold.nextAction, "login_required_existing_account");
  });
});

test("bookings v2: hold status expires and releases slot", async () => {
  await withBookingV2Env({}, async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const bookingsRepository = {
      ensureSchema: async () => undefined,
      findSlotHoldById: async () => ({
        id: "hold_1",
        slotId: "slot_1",
        teacherId: "teacher_1",
        teacherName: "Teacher One",
        date: futureDate(),
        startTime: "10:00",
        endTime: "11:00",
        status: "active" as const,
        createdAt: past,
        expiresAt: past,
      }),
      transitionSlotHoldToReleasedAtomic: async () => ({
        id: "hold_1",
        slotId: "slot_1",
        teacherId: "teacher_1",
        teacherName: "Teacher One",
        date: futureDate(),
        startTime: "10:00",
        endTime: "11:00",
        status: "expired" as const,
        createdAt: past,
        expiresAt: past,
        releasedAt: new Date().toISOString(),
      }),
    };
    const authRepository = {
      findById: async () => null,
      findByEmail: async () => null,
    };
    const redisService = {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    };

    const service = new BookingsService(
      bookingsRepository as never,
      authRepository as never,
      redisService as never
    );

    const status = await service.getSlotHoldStatus({ holdId: "hold_1" });
    assert.equal(status.hold.status, "expired");
    assert.equal(status.nextAction, "hold_expired");
    assert.equal(status.canConfirm, false);
  });
});

test("bookings v2: confirm requires completed identity lifecycle", async () => {
  await withBookingV2Env({}, async () => {
    const date = futureDate();
    const bookingsRepository = {
      ensureSchema: async () => undefined,
      findIdempotentResponse: async () => null,
      findSlotHoldById: async () => ({
        id: "hold_1",
        slotId: "slot_1",
        teacherId: "teacher_1",
        teacherName: "Teacher One",
        date,
        startTime: "10:00",
        endTime: "11:00",
        status: "active" as const,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    };
    const authRepository = {
      findById: async () => ({
        id: "teacher_1",
        email: "teacher@example.com",
        firstName: "Teacher",
        lastName: "One",
        role: "teacher",
      }),
      findByEmail: async () => null,
    };
    const redisService = {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    };
    const authService = {
      getIdentityCompletionStatus: async () => ({
        completionState: "pending_first_password",
      }),
    };

    const service = new BookingsService(
      bookingsRepository as never,
      authRepository as never,
      redisService as never,
      authService as never
    );

    await assert.rejects(
      () =>
        service.confirmSlotHoldBooking({
          holdId: "hold_1",
          payload: {},
          actorUser: {
            id: "student_1",
            email: "student@example.com",
            firstName: "Student",
            lastName: "One",
            role: "student",
          },
        }),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 409 &&
        String((error.getResponse() as { code?: string }).code) ===
          "identity_completion_required"
    );
  });
});

test("bookings v2: confirm creates user-bound booking and issues capabilities", async () => {
  await withBookingV2Env({}, async () => {
    const date = futureDate();
    let capturedBooking: BookingRecord | null = null;
    let capabilityIssued = false;
    const bookingsRepository = {
      ensureSchema: async () => undefined,
      findIdempotentResponse: async () => null,
      findSlotHoldById: async () => ({
        id: "hold_1",
        slotId: "slot_1",
        teacherId: "teacher_1",
        teacherName: "Teacher One",
        date,
        startTime: "10:00",
        endTime: "11:00",
        status: "active" as const,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      hasBookingsForStudent: async () => false,
      confirmSlotHoldBookingAtomic: async (params: { booking: BookingRecord }) => {
        capturedBooking = params.booking;
        return { outcome: "confirmed" as const };
      },
      saveIdempotentResponse: async () => undefined,
      findBookingBySlotId: async () => null,
    };
    const authRepository = {
      findById: async () => ({
        id: "teacher_1",
        email: "teacher@example.com",
        firstName: "Teacher",
        lastName: "One",
        role: "teacher",
      }),
      findByEmail: async () => null,
    };
    const redisService = {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    };
    const authService = {
      getIdentityCompletionStatus: async () => ({
        completionState: "completed",
      }),
    };
    const capabilitiesService = {
      grantBookingInteractionCapabilities: async () => {
        capabilityIssued = true;
      },
    };

    const service = new BookingsService(
      bookingsRepository as never,
      authRepository as never,
      redisService as never,
      authService as never,
      capabilitiesService as never
    );

    const confirmed = await service.confirmSlotHoldBooking({
      holdId: "hold_1",
      payload: {},
      actorUser: {
        id: "student_1",
        email: "student@example.com",
        firstName: "Student",
        lastName: "One",
        role: "student",
      },
    });

    assert.equal(confirmed.studentId, "student_1");
    assert.ok(capturedBooking);
    assert.equal((capturedBooking as BookingRecord).identityKind, "user_bound");
    assert.equal(capabilityIssued, true);
  });
});

test("bookings v2: repeated confirm is idempotent for consumed hold", async () => {
  await withBookingV2Env({}, async () => {
    const date = futureDate();
    const existingBooking: BookingRecord = {
      id: "booking_1",
      slotId: "slot_1",
      teacherId: "teacher_1",
      teacherName: "Teacher One",
      studentId: "student_1",
      studentName: "Student One",
      studentEmail: "student@example.com",
      date,
      startTime: "10:00",
      endTime: "11:00",
      lessonKind: "trial",
      status: "scheduled",
      paymentStatus: "unpaid",
      meetingUrl: "",
      materials: [],
      identityKind: "user_bound",
      identityEmailCanonical: "student@example.com",
      createdAt: new Date().toISOString(),
    };

    const bookingsRepository = {
      ensureSchema: async () => undefined,
      findIdempotentResponse: async () => null,
      findSlotHoldById: async () => ({
        id: "hold_1",
        slotId: "slot_1",
        teacherId: "teacher_1",
        teacherName: "Teacher One",
        date,
        startTime: "10:00",
        endTime: "11:00",
        status: "consumed" as const,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      findBookingBySlotId: async () => existingBooking,
    };
    const authRepository = {
      findById: async () => null,
      findByEmail: async () => null,
    };
    const redisService = {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    };

    const service = new BookingsService(
      bookingsRepository as never,
      authRepository as never,
      redisService as never
    );

    const confirmed = await service.confirmSlotHoldBooking({
      holdId: "hold_1",
      payload: {},
      actorUser: {
        id: "student_1",
        email: "student@example.com",
        firstName: "Student",
        lastName: "One",
        role: "student",
      },
    });

    assert.equal(confirmed.id, "booking_1");
  });
});

test("bookings: legacy guest path stays available when booking-v2 is disabled", async () => {
  await withBookingV2Env(
    {
      BOOKING_V2_ENABLED: "false",
      BOOKING_V2_GUEST_COMPAT_ENABLED: "true",
    },
    async () => {
      const { repository, captured, date } = buildBaseRepository();
      const authRepository = {
        findById: async () => ({
          id: "teacher_1",
          email: "teacher@example.com",
          firstName: "Teacher",
          lastName: "One",
          role: "teacher",
        }),
        findByEmail: async () => null,
      };
      const redisService = {
        setIfAbsent: async () => true,
        releaseLock: async () => undefined,
      };

      const service = new BookingsService(
        repository as never,
        authRepository as never,
        redisService as never
      );

      const booking = await service.createBooking({
        payload: {
          teacherId: "teacher_1",
          teacherName: "Teacher One",
          slotId: "slot_1",
          studentEmail: "guest@example.com",
          studentFirstName: "Guest",
          studentLastName: "Student",
          date,
          startTime: "10:00",
          endTime: "11:00",
        },
        actorUser: null,
      });

      assert.equal(booking.status, "scheduled");
      assert.equal(captured.booking?.identityKind, "guest_pending");
    }
  );
});
