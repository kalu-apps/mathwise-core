import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUserDto } from "../auth/auth.types";
import type { CheckoutProcessDto } from "./purchases.types";
import { PurchasesService } from "./purchases.service";

test("purchases: cancel checkout returns cached idempotent response", async () => {
  const expected = {
    ok: true,
    idempotent: true,
    checkout: {
      id: "checkout_cached",
      state: "canceled",
    },
  } as const;

  const purchasesRepository = {
    findIdempotentResponse: async () => expected,
  };

  const redisService = {
    setIfAbsent: async () => {
      throw new Error("lock must not be acquired for cached idempotent response");
    },
    releaseLock: async () => undefined,
  };

  const service = new PurchasesService(
    purchasesRepository as never,
    {} as never,
    {} as never,
    {} as never,
    redisService as never
  );

  const result = await service.cancelCheckout({
    checkoutId: "checkout_cached",
    actorUser: null,
    idempotencyKey: "same-request-key",
  });

  assert.deepEqual(result, expected);
});

test("purchases: confirm-paid rejects invalid canceled checkout transition", async () => {
  const actorUser: AuthUserDto = {
    id: "student_1",
    email: "student@example.com",
    firstName: "Student",
    lastName: "One",
    role: "student",
  };

  const canceledCheckout: CheckoutProcessDto = {
    id: "checkout_1",
    userId: actorUser.id,
    email: actorUser.email,
    courseId: "course_1",
    method: "card",
    amount: 3900,
    currency: "RUB",
    state: "canceled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let releaseCalls = 0;
  const purchasesRepository = {
    findIdempotentResponse: async () => null,
    findCheckoutById: async () => canceledCheckout,
  };
  const redisService = {
    setIfAbsent: async () => true,
    releaseLock: async () => {
      releaseCalls += 1;
    },
  };

  const service = new PurchasesService(
    purchasesRepository as never,
    {} as never,
    {} as never,
    {} as never,
    redisService as never
  );

  await assert.rejects(
    () =>
      service.confirmCheckoutPaid({
        checkoutId: canceledCheckout.id,
        actorUser,
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

  assert.equal(releaseCalls, 1);
});
