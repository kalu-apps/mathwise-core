import assert from "node:assert/strict";
import test from "node:test";
import { BookingsService } from "./bookings.service";

test("bookings: create rejects already occupied slot with 409 conflict", async () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const date = future.toISOString().slice(0, 10);

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
          studentEmail: "student@example.com",
          date,
          startTime: "10:00",
          endTime: "11:00",
        },
        actorUser: null,
      }),
    (error: unknown) => {
      const status =
        error &&
        typeof error === "object" &&
        "getStatus" in error &&
        typeof (error as { getStatus: () => number }).getStatus === "function"
          ? (error as { getStatus: () => number }).getStatus()
          : null;
      return status === 409;
    }
  );
});
