import type { CheckoutProcessDto, PurchaseRecordDto } from "./purchases.types";

type SqlMutationExecutor = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
};

export const writePurchase = async (
  executor: SqlMutationExecutor,
  purchase: PurchaseRecordDto
) => {
  await executor.execute(
    `
      INSERT INTO profile_purchases (
        id,
        user_id,
        course_id,
        price,
        tariff,
        purchased_at,
        payment_method,
        checkout_id,
        bnpl_json,
        course_snapshot_json,
        lessons_snapshot_json,
        purchased_test_item_ids_json,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        course_id = EXCLUDED.course_id,
        price = EXCLUDED.price,
        tariff = EXCLUDED.tariff,
        purchased_at = EXCLUDED.purchased_at,
        payment_method = EXCLUDED.payment_method,
        checkout_id = EXCLUDED.checkout_id,
        bnpl_json = EXCLUDED.bnpl_json,
        course_snapshot_json = EXCLUDED.course_snapshot_json,
        lessons_snapshot_json = EXCLUDED.lessons_snapshot_json,
        purchased_test_item_ids_json = EXCLUDED.purchased_test_item_ids_json,
        updated_at = NOW()
    `,
    [
      purchase.id,
      purchase.userId,
      purchase.courseId,
      Math.max(0, Math.round(purchase.price)),
      purchase.tariff ?? null,
      purchase.purchasedAt,
      purchase.paymentMethod ?? null,
      purchase.checkoutId ?? null,
      JSON.stringify(purchase.bnpl ?? null),
      JSON.stringify(purchase.courseSnapshot ?? null),
      JSON.stringify(purchase.lessonsSnapshot ?? null),
      JSON.stringify(purchase.purchasedTestItemIds ?? null),
    ]
  );
};

export const writeAccessContext = async (
  executor: SqlMutationExecutor,
  params: {
    userId: string;
    email: string;
    role: "student" | "teacher";
    isIdentityVerified: boolean;
  }
) => {
  await executor.execute(
    `
      INSERT INTO access_users (
        id,
        email,
        role,
        is_identity_verified,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_identity_verified = EXCLUDED.is_identity_verified,
        updated_at = NOW()
    `,
    [params.userId, params.email, params.role, params.isIdentityVerified]
  );
};

export const writeCourseEntitlementFlag = async (
  executor: SqlMutationExecutor,
  params: {
    userId: string;
    courseId: string;
    hasActiveEntitlement: boolean;
  }
) => {
  await executor.execute(
    `
      INSERT INTO user_course_access (
        user_id,
        course_id,
        has_active_entitlement,
        updated_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, course_id)
      DO UPDATE SET
        has_active_entitlement = EXCLUDED.has_active_entitlement,
        updated_at = NOW()
    `,
    [params.userId, params.courseId, params.hasActiveEntitlement]
  );
};

export const writeCourseEntitlement = async (
  executor: SqlMutationExecutor,
  params: {
    id: string;
    userId: string;
    courseId: string;
    purchaseId: string;
    checkoutId?: string;
    state: "active" | "revoked" | "expired";
    createdAt: string;
    updatedAt: string;
  }
) => {
  await executor.execute(
    `
      INSERT INTO course_entitlements (
        id,
        user_id,
        course_id,
        purchase_id,
        checkout_id,
        state,
        created_at,
        updated_at,
        updated_at_ts
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id, course_id, purchase_id)
      DO UPDATE SET
        checkout_id = EXCLUDED.checkout_id,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        updated_at_ts = NOW()
    `,
    [
      params.id,
      params.userId,
      params.courseId,
      params.purchaseId,
      params.checkoutId ?? null,
      params.state,
      params.createdAt,
      params.updatedAt,
    ]
  );
};

export const writeCapabilityGrant = async (
  executor: SqlMutationExecutor,
  params: {
    id: string;
    userId: string;
    capability: "course_access" | "teacher_chat_access" | "whiteboard_access";
    sourceKind: "purchase" | "booking" | "legacy_inferred";
    sourceRef: string;
    courseId?: string;
    teacherId?: string;
    state: "active" | "revoked" | "expired";
    grantedAt: string;
    updatedAt: string;
  }
) => {
  await executor.execute(
    `
      INSERT INTO access_capability_grants (
        id,
        user_id,
        capability,
        source_kind,
        source_ref,
        course_id,
        teacher_id,
        state,
        granted_at,
        updated_at,
        updated_at_ts
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (user_id, capability, source_kind, source_ref, course_id, teacher_id)
      DO UPDATE SET
        state = EXCLUDED.state,
        granted_at = EXCLUDED.granted_at,
        updated_at = EXCLUDED.updated_at,
        updated_at_ts = NOW()
    `,
    [
      params.id,
      params.userId,
      params.capability,
      params.sourceKind,
      params.sourceRef,
      params.courseId ?? "",
      params.teacherId ?? "",
      params.state,
      params.grantedAt,
      params.updatedAt,
    ]
  );
};

export const writeCheckout = async (
  executor: SqlMutationExecutor,
  checkout: CheckoutProcessDto
) => {
  await executor.execute(
    `
      UPDATE checkout_processes
      SET
        user_id = $2,
        email = $3,
        first_name = $4,
        last_name = $5,
        phone = $6,
        course_id = $7,
        method = $8,
        bnpl_installments_count = $9,
        amount = $10,
        tariff = $11,
        currency = $12,
        state = $13,
        provider_payment_id = $14,
        provider_event_id = $15,
        provider_payload_json = $16::jsonb,
        consent_snapshot_json = $17::jsonb,
        created_at = $18,
        updated_at = $19,
        expires_at = $20,
        updated_at_ts = NOW()
      WHERE id = $1
    `,
    [
      checkout.id,
      checkout.userId ?? null,
      checkout.email,
      checkout.firstName ?? null,
      checkout.lastName ?? null,
      checkout.phone ?? null,
      checkout.courseId,
      checkout.method,
      checkout.bnplInstallmentsCount ?? null,
      Math.max(0, Math.round(checkout.amount)),
      checkout.tariff ?? null,
      checkout.currency,
      checkout.state,
      checkout.providerPaymentId ?? null,
      checkout.providerEventId ?? null,
      JSON.stringify(checkout.providerPayload ?? null),
      JSON.stringify(checkout.consentSnapshot ?? null),
      checkout.createdAt,
      checkout.updatedAt,
      checkout.expiresAt ?? null,
    ]
  );
};
