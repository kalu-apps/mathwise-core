import assert from "node:assert/strict";
import test from "node:test";
import { buildCheckoutProviderPayload, resolveCheckoutIdentityContext } from "./purchases.identity-orchestration";

test("purchase identity orchestration: authenticated actor resolves email without intent", async () => {
  const resolved = await resolveCheckoutIdentityContext({
    actorUser: {
      id: "student_1",
      role: "student",
      email: "Student@Example.com",
      firstName: "Student",
      lastName: "One",
    },
    payload: {
      email: "",
      firstName: "Student",
      lastName: "One",
      phone: "+79990000000",
      courseId: "course_1",
      paymentMethod: "card",
      price: 1000,
      consents: { acceptedScopes: ["checkout"] },
    },
    runtimeConfig: {
      authPurchaseIdentityIntentGatingEnabled: true,
      authIdentityIntentsEnabled: true,
    } as never,
    authIdentityIntentService: null,
  });

  assert.equal(resolved.email, "student@example.com");
  assert.equal(resolved.identityIntent, undefined);
});

test("purchase identity orchestration: unauth checkout requires identity intent when gating enabled", async () => {
  await assert.rejects(
    () =>
      resolveCheckoutIdentityContext({
        actorUser: null,
        payload: {
          email: "student@example.com",
          firstName: "Student",
          lastName: "One",
          phone: "+79990000000",
          courseId: "course_1",
          paymentMethod: "card",
          price: 1000,
          consents: { acceptedScopes: ["checkout"] },
        },
        runtimeConfig: {
          authPurchaseIdentityIntentGatingEnabled: true,
          authIdentityIntentsEnabled: true,
        } as never,
        authIdentityIntentService: {
          resolveVerifiedForPurchase: async () => ({
            intentId: "intent_1",
            email: "student@example.com",
            channel: "email",
            verifiedAt: new Date().toISOString(),
          }),
        } as never,
      }),
    (error: unknown) => {
      const response =
        error &&
        typeof error === "object" &&
        "getResponse" in error &&
        typeof (error as { getResponse: () => unknown }).getResponse === "function"
          ? ((error as { getResponse: () => unknown }).getResponse() as {
              code?: string;
            })
          : null;
      return response?.code === "identity_intent_required";
    }
  );
});

test("purchase identity orchestration: provider payload includes intent metadata only when intent exists", () => {
  assert.equal(
    buildCheckoutProviderPayload({ identityIntentId: "   " }),
    undefined
  );

  assert.deepEqual(
    buildCheckoutProviderPayload({
      identityIntentId: "intent_1",
      identityIntentChannel: "email",
      identityIntentVerifiedAt: "2026-04-14T00:00:00.000Z",
    }),
    {
      identityIntentId: "intent_1",
      identityIntentChannel: "email",
      identityIntentVerifiedAt: "2026-04-14T00:00:00.000Z",
    }
  );
});
