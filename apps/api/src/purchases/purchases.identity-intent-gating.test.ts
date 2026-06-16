import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { PurchasesService } from "./purchases.service";
import type { CheckoutProcessDto } from "./purchases.types";

const withStageRuntimeEnv = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>
) => {
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
    process.env.EMAIL_DELIVERY_MODE = "disabled";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.PAYMENT_MOCK_ENABLED = "false";
    process.env.AUTH_IDENTITY_INTENTS_ENABLED = "true";
    process.env.AUTH_PURCHASE_IDENTITY_INTENT_GATING_ENABLED = "true";
    process.env.YOOKASSA_MODE = "disabled";

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

const createServiceForCheckout = (options?: {
  resolveIntent?: (intentId: string) => Promise<{
    intentId: string;
    channel: string;
    email: string;
    verifiedAt: string | null;
    expiresAt: string;
  }>;
  consumeIntent?: (intentId: string) => Promise<{
    ok: boolean;
    intentId: string | null;
    state: "pending" | "verified" | "expired" | "consumed" | "conflict";
    message: string;
  }>;
  existingCheckoutByIntent?: CheckoutProcessDto | null;
  existingActiveCheckout?: CheckoutProcessDto | null;
  onCapabilitySync?: (payload: {
    userId: string;
    purchaseId: string;
    courseId: string;
    tariff: "standard" | "premium";
    teacherId?: string | null;
    grantedAt: string;
  }) => Promise<void>;
}) => {
  const inserted: CheckoutProcessDto[] = [];
  const timelineTypes: string[] = [];
  const consumeCalls: string[] = [];
  const capabilitySyncCalls: Array<{
    userId: string;
    purchaseId: string;
    courseId: string;
    tariff: "standard" | "premium";
    teacherId?: string | null;
    grantedAt: string;
  }> = [];

  const purchasesRepository = {
    findIdempotentResponse: async () => null,
    saveIdempotentResponse: async () => undefined,
    findLatestCheckoutByIdentityIntentId: async () =>
      options?.existingCheckoutByIntent ?? null,
    findLatestActiveCheckout: async () => options?.existingActiveCheckout ?? null,
    insertCheckout: async (checkout: CheckoutProcessDto) => {
      inserted.push(checkout);
    },
    upsertConsentRecords: async () => undefined,
    addCheckoutTimelineEvent: async (params: { type: string }) => {
      timelineTypes.push(params.type);
    },
    getUserAccessContext: async () => ({
      role: "student" as const,
      isIdentityVerified: true,
      hasActiveEntitlement: false,
    }),
    updateCheckout: async () => undefined,
    findPurchaseByUserAndCourse: async () => null,
    provisionCheckoutAtomic: async () => undefined,
    upsertCapabilityGrantsForPurchase: async (payload: {
      userId: string;
      purchaseId: string;
      courseId: string;
      tariff: "standard" | "premium";
      teacherId?: string | null;
      grantedAt: string;
    }) => {
      capabilitySyncCalls.push(payload);
      if (options?.onCapabilitySync) {
        await options.onCapabilitySync(payload);
      }
    },
  };

  const service = new PurchasesService(
    purchasesRepository as never,
    {
      findPublishedById: async () => ({
        id: "course_1",
        slug: "course-1",
        title: "Course 1",
        priceGuided: 1000,
        priceSelf: 1000,
        teacherId: "teacher_1",
        status: "published",
      }),
      isTeacherDeleted: async () => false,
    } as never,
    {
      findAll: async () => [],
    } as never,
    {
      getIdentityCompletionStatus: async () => ({
        ok: true as const,
        userId: "user_1",
        identityVerified: true,
        accountFinalized: true,
        hasPassword: true,
        firstPasswordRequired: false,
        completionState: "completed" as const,
        identityVerifiedAt: "2026-04-14T00:00:00.000Z",
        accountFinalizedAt: "2026-04-14T00:00:00.000Z",
        firstPasswordSetAt: "2026-04-14T00:00:00.000Z",
        completedAt: "2026-04-14T00:00:00.000Z",
        source: "test",
      }),
      syncIdentityCompletionAfterPurchase: async () => undefined,
    } as never,
    {
      ensureUserByEmail: async () => ({
        user: {
          id: "user_1",
          email: "verified@example.com",
          firstName: "Student",
          lastName: "One",
          role: "student" as const,
        },
        isNew: false,
      }),
    } as never,
    {
      enqueueAndDispatch: async () => undefined,
    } as never,
    {
      setIfAbsent: async () => true,
      releaseLock: async () => undefined,
    } as never,
    {
      resolveVerifiedForPurchase: async (intentId: string) =>
        options?.resolveIntent
          ? options.resolveIntent(intentId)
          : {
              intentId,
              channel: "email",
              email: "verified@example.com",
              verifiedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
      consume: async (intentId: string) => {
        consumeCalls.push(intentId);
        if (options?.consumeIntent) {
          return options.consumeIntent(intentId);
        }
        return {
          ok: true,
          intentId,
          state: "consumed" as const,
          message: "ok",
        };
      },
    } as never
  );

  return { service, inserted, timelineTypes, consumeCalls, capabilitySyncCalls };
};

test("purchase gating: unauth checkout without identity_intent_id is blocked", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service } = createServiceForCheckout();
    await assert.rejects(
      () =>
        service.checkoutPurchase({
          payload: {
            email: "student@example.com",
            firstName: "Student",
            lastName: "One",
            phone: "+79990000000",
            courseId: "course_1",
            price: 1000,
            paymentMethod: "card",
            consents: { acceptedScopes: ["checkout"] },
          },
          actorUser: null,
        }),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 400 &&
        String((error.getResponse() as { code?: string })?.code) ===
          "identity_intent_required"
    );
  });
});

test("purchase gating: unauth checkout with verified identity intent is allowed", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service, inserted, timelineTypes } = createServiceForCheckout({
      resolveIntent: async (intentId) => ({
        intentId,
        channel: "email",
        email: "verified@example.com",
        verifiedAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2026-04-14T00:15:00.000Z",
      }),
    });

    const response = await service.checkoutPurchase({
      payload: {
        identityIntentId: "intent_ok_1",
        firstName: "Student",
        lastName: "One",
        phone: "+79990000000",
        courseId: "course_1",
        price: 1000,
        paymentMethod: "card",
        consents: { acceptedScopes: ["checkout"] },
      },
      actorUser: null,
    });

    assert.equal(response.checkoutState, "pending_provider");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]?.email, "verified@example.com");
    assert.equal(
      (inserted[0]?.providerPayload as { identityIntentId?: string } | undefined)
        ?.identityIntentId,
      "intent_ok_1"
    );
    assert.equal(timelineTypes.includes("checkout_created"), true);
  });
});

test("purchase gating: expired identity intent is blocked", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service } = createServiceForCheckout({
      resolveIntent: async () => {
        throw new HttpException(
          { error: "expired", code: "identity_intent_expired" },
          409
        );
      },
    });

    await assert.rejects(
      () =>
        service.checkoutPurchase({
          payload: {
            identityIntentId: "intent_expired",
            firstName: "Student",
            lastName: "One",
            phone: "+79990000000",
            courseId: "course_1",
            price: 1000,
            paymentMethod: "card",
            consents: { acceptedScopes: ["checkout"] },
          },
          actorUser: null,
        }),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 409 &&
        String((error.getResponse() as { code?: string })?.code) ===
          "identity_intent_expired"
    );
  });
});

test("purchase gating: consumed identity intent is blocked", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service } = createServiceForCheckout({
      resolveIntent: async () => {
        throw new HttpException(
          { error: "consumed", code: "identity_intent_consumed" },
          409
        );
      },
    });

    await assert.rejects(
      () =>
        service.checkoutPurchase({
          payload: {
            identityIntentId: "intent_consumed",
            firstName: "Student",
            lastName: "One",
            phone: "+79990000000",
            courseId: "course_1",
            price: 1000,
            paymentMethod: "card",
            consents: { acceptedScopes: ["checkout"] },
          },
          actorUser: null,
        }),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 409 &&
        String((error.getResponse() as { code?: string })?.code) ===
          "identity_intent_consumed"
    );
  });
});

test("purchase gating: conflict identity intent is blocked", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service } = createServiceForCheckout({
      resolveIntent: async () => {
        throw new HttpException(
          { error: "conflict", code: "identity_intent_conflict" },
          409
        );
      },
    });

    await assert.rejects(
      () =>
        service.checkoutPurchase({
          payload: {
            identityIntentId: "intent_conflict",
            firstName: "Student",
            lastName: "One",
            phone: "+79990000000",
            courseId: "course_1",
            price: 1000,
            paymentMethod: "card",
            consents: { acceptedScopes: ["checkout"] },
          },
          actorUser: null,
        }),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 409 &&
        String((error.getResponse() as { code?: string })?.code) ===
          "identity_intent_conflict"
    );
  });
});

test("purchase gating: authenticated checkout works without identity intent", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service, inserted } = createServiceForCheckout({
      resolveIntent: async () => {
        throw new Error("intent resolver must not be called for authenticated checkout");
      },
    });

    const response = await service.checkoutPurchase({
      payload: {
        firstName: "Student",
        lastName: "One",
        phone: "+79990000000",
        courseId: "course_1",
        price: 1000,
        paymentMethod: "card",
        consents: { acceptedScopes: ["checkout"] },
      },
      actorUser: {
        id: "user_1",
        email: "student@example.com",
        firstName: "Student",
        lastName: "One",
        role: "student",
      },
    });

    assert.equal(response.checkoutState, "pending_provider");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]?.userId, "user_1");
    assert.equal(inserted[0]?.email, "student@example.com");
  });
});

test("purchase gating: feature flag off keeps legacy unauth checkout path", async () => {
  await withStageRuntimeEnv(
    {
      AUTH_PURCHASE_IDENTITY_INTENT_GATING_ENABLED: "false",
      AUTH_IDENTITY_INTENTS_ENABLED: "false",
    },
    async () => {
      const { service, inserted } = createServiceForCheckout({
        resolveIntent: async () => {
          throw new Error("intent resolver must not be called when gating is disabled");
        },
      });

      const response = await service.checkoutPurchase({
        payload: {
          email: "legacy@example.com",
          firstName: "Student",
          lastName: "One",
          phone: "+79990000000",
          courseId: "course_1",
          price: 1000,
          paymentMethod: "card",
          consents: { acceptedScopes: ["checkout"] },
        },
        actorUser: null,
      });

      assert.equal(response.checkoutState, "pending_provider");
      assert.equal(inserted.length, 1);
      assert.equal(inserted[0]?.email, "legacy@example.com");
    }
  );
});

test("purchase gating: provisioning consumes identity intent after successful finalization", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service, consumeCalls } = createServiceForCheckout();

    const checkout: CheckoutProcessDto = {
      id: "checkout_1",
      email: "verified@example.com",
      firstName: "Student",
      lastName: "One",
      phone: "+79990000000",
      courseId: "course_1",
      method: "card",
      amount: 1000,
      currency: "RUB",
      state: "provider_confirmed",
      providerPayload: {
        identityIntentId: "intent_provision_1",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const finalCheckout = await (
      service as unknown as {
        ensureCheckoutProvisioned: (input: CheckoutProcessDto) => Promise<CheckoutProcessDto>;
      }
    ).ensureCheckoutProvisioned(checkout);

    assert.equal(finalCheckout.state, "provisioned");
    assert.deepEqual(consumeCalls, ["intent_provision_1"]);
  });
});

test("purchase capability sync: standard checkout emits standard capability issuance", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service, capabilitySyncCalls } = createServiceForCheckout();

    const checkout: CheckoutProcessDto = {
      id: "checkout_cap_standard_1",
      email: "verified@example.com",
      firstName: "Student",
      lastName: "One",
      phone: "+79990000000",
      courseId: "course_1",
      method: "card",
      amount: 1000,
      currency: "RUB",
      tariff: "standard",
      state: "provider_confirmed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await (
      service as unknown as {
        ensureCheckoutProvisioned: (input: CheckoutProcessDto) => Promise<CheckoutProcessDto>;
      }
    ).ensureCheckoutProvisioned(checkout);

    assert.equal(capabilitySyncCalls.length, 1);
    assert.equal(capabilitySyncCalls[0]?.tariff, "standard");
    assert.equal(capabilitySyncCalls[0]?.teacherId, "teacher_1");
  });
});

test("purchase capability sync: premium checkout emits premium capability issuance", async () => {
  await withStageRuntimeEnv({}, async () => {
    const { service, capabilitySyncCalls } = createServiceForCheckout();

    const checkout: CheckoutProcessDto = {
      id: "checkout_cap_premium_1",
      email: "verified@example.com",
      firstName: "Student",
      lastName: "One",
      phone: "+79990000000",
      courseId: "course_1",
      method: "card",
      amount: 1000,
      currency: "RUB",
      tariff: "premium",
      state: "provider_confirmed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await (
      service as unknown as {
        ensureCheckoutProvisioned: (input: CheckoutProcessDto) => Promise<CheckoutProcessDto>;
      }
    ).ensureCheckoutProvisioned(checkout);

    assert.equal(capabilitySyncCalls.length, 1);
    assert.equal(capabilitySyncCalls[0]?.tariff, "premium");
    assert.equal(capabilitySyncCalls[0]?.courseId, "course_1");
  });
});
