import assert from "node:assert/strict";
import test from "node:test";
import { PurchasesService } from "./purchases.service";

const withRequiredRuntimeEnv = async (run: () => Promise<void>) => {
  const snapshot = {
    APP_ENV: process.env.APP_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
  };

  process.env.APP_ENV = "local";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://local/test";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  try {
    await run();
  } finally {
    if (snapshot.APP_ENV === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = snapshot.APP_ENV;

    if (snapshot.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = snapshot.DATABASE_URL;

    if (snapshot.REDIS_URL === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = snapshot.REDIS_URL;
  }
};

test("purchases: cancel checkout returns cached idempotent response", async () => {
  await withRequiredRuntimeEnv(async () => {
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
});

test("purchases: course-level delete request preserves purchase history", async () => {
  await withRequiredRuntimeEnv(async () => {
    let deletedPurchases = false;
    let processedOrphans = false;

    const service = new PurchasesService(
      {
        deletePurchasesByCourse: async () => {
          deletedPurchases = true;
        },
      } as never,
      {} as never,
      {} as never,
      {
        processOrphanCandidates: async () => {
          processedOrphans = true;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never
    );

    await service.deletePurchasesByCourse("course_1", {
      id: "teacher_1",
      email: "teacher@example.test",
      firstName: "Teacher",
      lastName: "One",
      role: "teacher",
    });

    assert.equal(deletedPurchases, false);
    assert.equal(processedOrphans, false);
  });
});

test("purchases: webhook rejects stale timestamp", async () => {
  await withRequiredRuntimeEnv(async () => {
    const purchasesRepository = {
      findPaymentEventByDedupeKey: async () => null,
    };

    const redisService = {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    };

    const service = new PurchasesService(
      purchasesRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      redisService as never
    );

    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await assert.rejects(
      () =>
        service.handleProviderWebhook({
          payload: {
            eventId: "evt-stale",
            checkoutId: "checkout_1",
            status: "paid",
          },
          signature: "invalid",
          timestamp: staleTimestamp,
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
});

test("purchases: stage runtime rejects mock checkout method", async () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.PAYMENT_MOCK_ENABLED = "false";

    const service = new PurchasesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await assert.rejects(
      () =>
        service.checkoutPurchase({
          payload: {
            email: "student@example.com",
            firstName: "Student",
            lastName: "Test",
            phone: "+79990000000",
            courseId: "course_1",
            price: 1000,
            paymentMethod: "mock",
            consents: {
              acceptedScopes: ["checkout"],
            },
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
        return status === 400;
      }
    );
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
});

test("purchases: stage confirm endpoint is unavailable outside stage runtime", async () => {
  await withRequiredRuntimeEnv(async () => {
    delete process.env.STAGE_PAYMENT_CONFIRM_ENABLED;
    const service = new PurchasesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await assert.rejects(
      () =>
        service.stageConfirmCheckout({
          checkoutId: "checkout_1",
          actorUser: {
            id: "student_1",
            email: "student@example.com",
            firstName: "Student",
            lastName: "One",
            role: "student",
          },
        }),
      (error: unknown) => {
        const status =
          error &&
          typeof error === "object" &&
          "getStatus" in error &&
          typeof (error as { getStatus: () => number }).getStatus === "function"
            ? (error as { getStatus: () => number }).getStatus()
            : null;
        return status === 404;
      }
    );
  });
});

test("purchases: stage confirm is blocked when YooKassa mode is enabled", async () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.STAGE_PAYMENT_CONFIRM_ENABLED = "true";
    process.env.YOOKASSA_MODE = "test";
    process.env.YOOKASSA_SHOP_ID = "shop_test";
    process.env.YOOKASSA_SECRET_KEY = "secret_test";
    process.env.YOOKASSA_RETURN_URL = "https://stage.mathwise.ru/courses";

    const service = new PurchasesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await assert.rejects(
      () =>
        service.stageConfirmCheckout({
          checkoutId: "checkout_1",
          actorUser: {
            id: "student_1",
            email: "student@example.com",
            firstName: "Student",
            lastName: "One",
            role: "student",
          },
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
});

test("purchases: stage confirm reuses backend provider-confirm chain", async () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.PAYMENT_MOCK_ENABLED = "false";
    process.env.STAGE_PAYMENT_CONFIRM_ENABLED = "true";

    const checkout = {
      id: "checkout_stage_1",
      userId: "student_1",
      email: "student@example.com",
      firstName: "Student",
      lastName: "One",
      phone: "+79990000000",
      courseId: "course_1",
      method: "card",
      amount: 1000,
      currency: "RUB",
      state: "pending_provider",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as const;

    let webhookCalled = false;

    const purchasesRepository = {
      findIdempotentResponse: async () => null,
      saveIdempotentResponse: async () => undefined,
      findCheckoutById: async () => checkout,
      addCheckoutTimelineEvent: async () => undefined,
    };

    const redisService = {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    };

    const service = new PurchasesService(
      purchasesRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      redisService as never
    );

    (service as unknown as { handleProviderWebhook: (value: unknown) => Promise<void> })
      .handleProviderWebhook = async () => {
      webhookCalled = true;
    };
    (service as unknown as { buildCheckoutStatusResponse: (value: unknown) => Promise<unknown> })
      .buildCheckoutStatusResponse = async () => ({
      checkoutId: checkout.id,
      state: checkout.state,
      method: checkout.method,
      amount: checkout.amount,
      currency: checkout.currency,
      createdAt: checkout.createdAt,
      updatedAt: checkout.updatedAt,
      expiresAt: null,
      isTerminal: false,
      payment: {
        provider: "card",
        status: "provider_confirmed",
        outcome: "applied",
        requiresConfirmation: false,
        lastProcessedAt: new Date().toISOString(),
      },
      access: null,
    });
    (service as unknown as { resumeProvisionIfNeeded: (value: typeof checkout) => Promise<typeof checkout> })
      .resumeProvisionIfNeeded = async (value) => value;

    const result = await service.stageConfirmCheckout({
      checkoutId: checkout.id,
      actorUser: {
        id: "student_1",
        email: "student@example.com",
        firstName: "Student",
        lastName: "One",
        role: "student",
      },
    });

    assert.equal(webhookCalled, true);
    assert.equal(result.ok, true);
    assert.equal(result.checkoutId, checkout.id);
    assert.equal(result.confirmationSource, "stage_stub");
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
});
