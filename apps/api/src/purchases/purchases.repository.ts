import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type {
  CheckoutListItemDto,
  CheckoutProcessDto,
  PurchaseRecordDto,
} from "./purchases.types";
import {
  mapCheckoutRow,
  mapPurchaseRow,
  type CheckoutRow,
  type PurchaseRow,
} from "./purchases.mappers";
import { PURCHASES_SCHEMA_STATEMENTS } from "./purchases.schema";
import {
  writeAccessContext,
  writeCheckout,
  writeCourseEntitlement,
  writeCourseEntitlementFlag,
  writePurchase,
} from "./purchases.repository.mutations";

type CheckoutTimelineRow = {
  id: string;
  checkoutId: string;
  type: string;
  details: unknown;
  createdAt: string;
};

type UserAccessRow = {
  role: "student" | "teacher";
  isIdentityVerified: boolean;
  hasActiveEntitlement: boolean;
};

type IdempotencyRow = {
  response: unknown;
};

type PaymentEventRow = {
  id: string;
  provider: string;
  externalEventId: string;
  dedupeKey: string;
  checkoutId: string;
  status: string;
  outcome: string;
  payload: unknown;
  createdAt: string;
  processedAt: string;
};

@Injectable()
export class PurchasesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    for (const statement of PURCHASES_SCHEMA_STATEMENTS) {
      await this.databaseService.execute(statement);
    }
  }

  async findPurchases(params?: { userId?: string }): Promise<PurchaseRecordDto[]> {
    const rows = await this.databaseService.query<PurchaseRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          course_id AS "courseId",
          price,
          tariff,
          purchased_at AS "purchasedAt",
          payment_method AS "paymentMethod",
          checkout_id AS "checkoutId",
          bnpl_json AS "bnpl",
          course_snapshot_json AS "courseSnapshot",
          lessons_snapshot_json AS "lessonsSnapshot",
          purchased_test_item_ids_json AS "purchasedTestItemIds"
        FROM profile_purchases
        WHERE ($1::text IS NULL OR user_id = $1)
        ORDER BY purchased_at DESC, id ASC
      `,
      [params?.userId ?? null]
    );
    return rows.map((row) => mapPurchaseRow(row));
  }

  async replacePurchasesForUser(
    userId: string,
    purchases: PurchaseRecordDto[]
  ): Promise<void> {
    await this.databaseService.execute(
      "DELETE FROM profile_purchases WHERE user_id = $1",
      [userId]
    );
    for (const purchase of purchases) {
      await this.upsertPurchase(purchase);
    }
  }

  async upsertPurchase(purchase: PurchaseRecordDto): Promise<void> {
    await writePurchase(this.databaseService, purchase);
  }

  async findPurchaseByUserAndCourse(
    userId: string,
    courseId: string
  ): Promise<PurchaseRecordDto | null> {
    const rows = await this.databaseService.query<PurchaseRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          course_id AS "courseId",
          price,
          tariff,
          purchased_at AS "purchasedAt",
          payment_method AS "paymentMethod",
          checkout_id AS "checkoutId",
          bnpl_json AS "bnpl",
          course_snapshot_json AS "courseSnapshot",
          lessons_snapshot_json AS "lessonsSnapshot",
          purchased_test_item_ids_json AS "purchasedTestItemIds"
        FROM profile_purchases
        WHERE user_id = $1 AND course_id = $2
        ORDER BY purchased_at DESC, id ASC
        LIMIT 1
      `,
      [userId, courseId]
    );
    const row = rows[0];
    return row ? mapPurchaseRow(row) : null;
  }

  async findPurchaseById(purchaseId: string): Promise<PurchaseRecordDto | null> {
    const rows = await this.databaseService.query<PurchaseRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          course_id AS "courseId",
          price,
          tariff,
          purchased_at AS "purchasedAt",
          payment_method AS "paymentMethod",
          checkout_id AS "checkoutId",
          bnpl_json AS "bnpl",
          course_snapshot_json AS "courseSnapshot",
          lessons_snapshot_json AS "lessonsSnapshot",
          purchased_test_item_ids_json AS "purchasedTestItemIds"
        FROM profile_purchases
        WHERE id = $1
        LIMIT 1
      `,
      [purchaseId]
    );
    const row = rows[0];
    return row ? mapPurchaseRow(row) : null;
  }

  async findPurchaseByCheckoutId(
    checkoutId: string
  ): Promise<PurchaseRecordDto | null> {
    const rows = await this.databaseService.query<PurchaseRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          course_id AS "courseId",
          price,
          tariff,
          purchased_at AS "purchasedAt",
          payment_method AS "paymentMethod",
          checkout_id AS "checkoutId",
          bnpl_json AS "bnpl",
          course_snapshot_json AS "courseSnapshot",
          lessons_snapshot_json AS "lessonsSnapshot",
          purchased_test_item_ids_json AS "purchasedTestItemIds"
        FROM profile_purchases
        WHERE checkout_id = $1
        ORDER BY purchased_at DESC, id DESC
        LIMIT 1
      `,
      [checkoutId]
    );
    const row = rows[0];
    return row ? mapPurchaseRow(row) : null;
  }

  async deletePurchasesByCourse(courseId: string): Promise<void> {
    await this.databaseService.execute(
      "DELETE FROM profile_purchases WHERE course_id = $1",
      [courseId]
    );
    await this.databaseService.execute(
      "DELETE FROM user_course_access WHERE course_id = $1",
      [courseId]
    );
  }

  async insertCheckout(checkout: CheckoutProcessDto): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO checkout_processes (
          id,
          user_id,
          email,
          first_name,
          last_name,
          phone,
          course_id,
          method,
          bnpl_installments_count,
          amount,
          tariff,
          currency,
          state,
          provider_payment_id,
          provider_event_id,
          provider_payload_json,
          consent_snapshot_json,
          created_at,
          updated_at,
          expires_at,
          updated_at_ts
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16::jsonb, $17::jsonb, $18, $19, $20, NOW()
        )
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
  }

  async updateCheckout(checkout: CheckoutProcessDto): Promise<void> {
    await writeCheckout(this.databaseService, checkout);
  }

  async findCheckoutById(checkoutId: string): Promise<CheckoutProcessDto | null> {
    const rows = await this.databaseService.query<CheckoutRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          phone,
          course_id AS "courseId",
          method,
          bnpl_installments_count AS "bnplInstallmentsCount",
          amount,
          tariff,
          currency,
          state,
          provider_payment_id AS "providerPaymentId",
          provider_event_id AS "providerEventId",
          provider_payload_json AS "providerPayload",
          consent_snapshot_json AS "consentSnapshot",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          expires_at AS "expiresAt"
        FROM checkout_processes
        WHERE id = $1
        LIMIT 1
      `,
      [checkoutId]
    );
    const row = rows[0];
    return row ? mapCheckoutRow(row) : null;
  }

  async findCheckoutByProviderPaymentId(
    providerPaymentId: string
  ): Promise<CheckoutProcessDto | null> {
    const rows = await this.databaseService.query<CheckoutRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          phone,
          course_id AS "courseId",
          method,
          bnpl_installments_count AS "bnplInstallmentsCount",
          amount,
          tariff,
          currency,
          state,
          provider_payment_id AS "providerPaymentId",
          provider_event_id AS "providerEventId",
          provider_payload_json AS "providerPayload",
          consent_snapshot_json AS "consentSnapshot",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          expires_at AS "expiresAt"
        FROM checkout_processes
        WHERE provider_payment_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      [providerPaymentId]
    );
    const row = rows[0];
    return row ? mapCheckoutRow(row) : null;
  }

  async listCheckouts(filters?: {
    userId?: string;
    email?: string;
    courseId?: string;
  }): Promise<CheckoutListItemDto[]> {
    const rows = await this.databaseService.query<CheckoutRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          phone,
          course_id AS "courseId",
          method,
          bnpl_installments_count AS "bnplInstallmentsCount",
          amount,
          tariff,
          currency,
          state,
          provider_payment_id AS "providerPaymentId",
          provider_event_id AS "providerEventId",
          provider_payload_json AS "providerPayload",
          consent_snapshot_json AS "consentSnapshot",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          expires_at AS "expiresAt"
        FROM checkout_processes
        WHERE ($1::text IS NULL OR user_id = $1)
          AND ($2::text IS NULL OR LOWER(email) = LOWER($2))
          AND ($3::text IS NULL OR course_id = $3)
        ORDER BY updated_at DESC, id DESC
      `,
      [filters?.userId ?? null, filters?.email ?? null, filters?.courseId ?? null]
    );
    return rows.map((row) => mapCheckoutRow(row));
  }

  async findLatestActiveCheckout(params: {
    userId?: string;
    email: string;
    courseId: string;
  }): Promise<CheckoutProcessDto | null> {
    const rows = await this.databaseService.query<CheckoutRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          phone,
          course_id AS "courseId",
          method,
          bnpl_installments_count AS "bnplInstallmentsCount",
          amount,
          tariff,
          currency,
          state,
          provider_payment_id AS "providerPaymentId",
          provider_event_id AS "providerEventId",
          provider_payload_json AS "providerPayload",
          consent_snapshot_json AS "consentSnapshot",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          expires_at AS "expiresAt"
        FROM checkout_processes
        WHERE course_id = $1
          AND (
            ($2::text IS NOT NULL AND user_id = $2)
            OR LOWER(email) = LOWER($3)
          )
          AND state IN ('created', 'pending_provider', 'provider_confirmed', 'provision_pending', 'provision_failed_retryable')
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      [params.courseId, params.userId ?? null, params.email]
    );
    const row = rows[0];
    return row ? mapCheckoutRow(row) : null;
  }

  async findLatestCheckoutByIdentityIntentId(
    identityIntentId: string
  ): Promise<CheckoutProcessDto | null> {
    const rows = await this.databaseService.query<CheckoutRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          phone,
          course_id AS "courseId",
          method,
          bnpl_installments_count AS "bnplInstallmentsCount",
          amount,
          tariff,
          currency,
          state,
          provider_payment_id AS "providerPaymentId",
          provider_event_id AS "providerEventId",
          provider_payload_json AS "providerPayload",
          consent_snapshot_json AS "consentSnapshot",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          expires_at AS "expiresAt"
        FROM checkout_processes
        WHERE provider_payload_json IS NOT NULL
          AND provider_payload_json ->> 'identityIntentId' = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      [identityIntentId]
    );
    const row = rows[0];
    return row ? mapCheckoutRow(row) : null;
  }

  async addCheckoutTimelineEvent(params: {
    id: string;
    checkoutId: string;
    type: string;
    details: Record<string, unknown>;
    createdAt: string;
  }) {
    await this.databaseService.execute(
      `
        INSERT INTO checkout_timeline_events (
          id,
          checkout_id,
          event_type,
          details_json,
          created_at,
          updated_at_ts
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
        ON CONFLICT (id)
        DO NOTHING
      `,
      [
        params.id,
        params.checkoutId,
        params.type,
        JSON.stringify(params.details ?? {}),
        params.createdAt,
      ]
    );
  }

  async listCheckoutTimelineEvents(checkoutId: string): Promise<CheckoutTimelineRow[]> {
    const rows = await this.databaseService.query<CheckoutTimelineRow>(
      `
        SELECT
          id,
          checkout_id AS "checkoutId",
          event_type AS "type",
          details_json AS "details",
          created_at AS "createdAt"
        FROM checkout_timeline_events
        WHERE checkout_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [checkoutId]
    );
    return rows;
  }

  async findIdempotentResponse<T>(
    scope: string,
    idempotencyKey: string
  ): Promise<T | null> {
    const rows = await this.databaseService.query<IdempotencyRow>(
      `
        SELECT response_json AS response
        FROM write_idempotency_records
        WHERE scope = $1
          AND idempotency_key = $2
          AND expires_at > NOW()
        LIMIT 1
      `,
      [scope, idempotencyKey]
    );
    const row = rows[0];
    return (row?.response as T | undefined) ?? null;
  }

  async saveIdempotentResponse(
    scope: string,
    idempotencyKey: string,
    response: unknown,
    ttlSec: number
  ): Promise<void> {
    const ttl = Number.isFinite(ttlSec) ? Math.max(30, Math.floor(ttlSec)) : 3600;
    await this.databaseService.execute(
      `
        INSERT INTO write_idempotency_records (
          scope,
          idempotency_key,
          response_json,
          expires_at,
          created_at
        )
        VALUES ($1, $2, $3::jsonb, NOW() + ($4 || ' seconds')::interval, NOW())
        ON CONFLICT (scope, idempotency_key)
        DO UPDATE SET
          response_json = EXCLUDED.response_json,
          expires_at = EXCLUDED.expires_at,
          created_at = NOW()
      `,
      [scope, idempotencyKey, JSON.stringify(response), String(ttl)]
    );
  }

  async ensureAccessContext(params: {
    userId: string;
    email: string;
    role: "student" | "teacher";
    isIdentityVerified: boolean;
  }): Promise<void> {
    await writeAccessContext(this.databaseService, params);
  }

  async setCourseEntitlement(
    userId: string,
    courseId: string,
    hasActiveEntitlement: boolean
  ): Promise<void> {
    await writeCourseEntitlementFlag(this.databaseService, {
      userId,
      courseId,
      hasActiveEntitlement,
    });
  }

  async upsertCourseEntitlement(params: {
    id: string;
    userId: string;
    courseId: string;
    purchaseId: string;
    checkoutId?: string;
    state: "active" | "revoked" | "expired";
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    await writeCourseEntitlement(this.databaseService, params);
  }

  async upsertConsentRecords(params: {
    checkoutId: string;
    email: string;
    scopes: string[];
    acceptedAt: string;
  }): Promise<void> {
    if (params.scopes.length === 0) return;
    for (const scope of params.scopes) {
      await this.databaseService.execute(
        `
          INSERT INTO consent_records (
            id,
            checkout_id,
            email,
            scope,
            accepted_at,
            updated_at_ts
          )
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (checkout_id, scope)
          DO UPDATE SET
            email = EXCLUDED.email,
            accepted_at = EXCLUDED.accepted_at,
            updated_at_ts = NOW()
        `,
        [
          `${params.checkoutId}:${scope}`,
          params.checkoutId,
          params.email,
          scope,
          params.acceptedAt,
        ]
      );
    }
  }

  async findPaymentEventByDedupeKey(
    dedupeKey: string
  ): Promise<PaymentEventRow | null> {
    const rows = await this.databaseService.query<PaymentEventRow>(
      `
        SELECT
          id,
          provider,
          external_event_id AS "externalEventId",
          dedupe_key AS "dedupeKey",
          checkout_id AS "checkoutId",
          status,
          outcome,
          payload_json AS payload,
          created_at AS "createdAt",
          processed_at AS "processedAt"
        FROM payment_events
        WHERE dedupe_key = $1
        LIMIT 1
      `,
      [dedupeKey]
    );
    return rows[0] ?? null;
  }

  async insertPaymentEvent(params: {
    id: string;
    provider: string;
    externalEventId: string;
    dedupeKey: string;
    checkoutId: string;
    status: string;
    outcome: string;
    payload: unknown;
    createdAt: string;
    processedAt: string;
  }): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO payment_events (
          id,
          provider,
          external_event_id,
          dedupe_key,
          checkout_id,
          status,
          outcome,
          payload_json,
          created_at,
          processed_at,
          updated_at_ts
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, NOW())
        ON CONFLICT (dedupe_key)
        DO NOTHING
      `,
      [
        params.id,
        params.provider,
        params.externalEventId,
        params.dedupeKey,
        params.checkoutId,
        params.status,
        params.outcome,
        JSON.stringify(params.payload ?? null),
        params.createdAt,
        params.processedAt,
      ]
    );
  }

  async provisionCheckoutAtomic(params: {
    checkout: CheckoutProcessDto;
    purchase: PurchaseRecordDto;
    accessContext: {
      userId: string;
      email: string;
      role: "student" | "teacher";
      isIdentityVerified: boolean;
      courseId: string;
      hasActiveEntitlement: boolean;
    };
    entitlement: {
      id: string;
      state: "active" | "revoked" | "expired";
      createdAt: string;
      updatedAt: string;
    };
  }): Promise<void> {
    await this.databaseService.transaction<void>(async (tx) => {
      await writePurchase(tx, params.purchase);
      await writeAccessContext(tx, {
        userId: params.accessContext.userId,
        email: params.accessContext.email,
        role: params.accessContext.role,
        isIdentityVerified: params.accessContext.isIdentityVerified,
      });
      await writeCourseEntitlementFlag(tx, {
        userId: params.accessContext.userId,
        courseId: params.accessContext.courseId,
        hasActiveEntitlement: params.accessContext.hasActiveEntitlement,
      });
      await writeCourseEntitlement(tx, {
        id: params.entitlement.id,
        userId: params.accessContext.userId,
        courseId: params.accessContext.courseId,
        purchaseId: params.purchase.id,
        checkoutId: params.checkout.id,
        state: params.entitlement.state,
        createdAt: params.entitlement.createdAt,
        updatedAt: params.entitlement.updatedAt,
      });
      await writeCheckout(tx, params.checkout);
    });
  }

  async revokePurchaseAccessAtomic(params: {
    userId: string;
    courseId: string;
    purchaseId: string;
    updatedAt: string;
  }): Promise<void> {
    await this.databaseService.transaction<void>(async (tx) => {
      await tx.execute(
        `
          UPDATE course_entitlements
          SET
            state = 'revoked',
            updated_at = $4,
            updated_at_ts = NOW()
          WHERE user_id = $1
            AND course_id = $2
            AND purchase_id = $3
            AND state = 'active'
        `,
        [params.userId, params.courseId, params.purchaseId, params.updatedAt]
      );

      const activeRows = await tx.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM course_entitlements
          WHERE user_id = $1
            AND course_id = $2
            AND state = 'active'
        `,
        [params.userId, params.courseId]
      );

      const hasActiveEntitlement = Number(activeRows[0]?.count ?? 0) > 0;
      await writeCourseEntitlementFlag(tx, {
        userId: params.userId,
        courseId: params.courseId,
        hasActiveEntitlement,
      });
    });
  }

  async getUserAccessContext(
    userId: string,
    courseId: string
  ): Promise<UserAccessRow> {
    const rows = await this.databaseService.query<UserAccessRow>(
      `
        SELECT
          COALESCE(au.role, 'student') AS role,
          COALESCE(au.is_identity_verified, FALSE) AS "isIdentityVerified",
          COALESCE(uca.has_active_entitlement, FALSE) AS "hasActiveEntitlement"
        FROM (SELECT $1::text AS user_id, $2::text AS course_id) input
        LEFT JOIN access_users au
          ON au.id = input.user_id
        LEFT JOIN user_course_access uca
          ON uca.user_id = input.user_id
         AND uca.course_id = input.course_id
        LIMIT 1
      `,
      [userId, courseId]
    );

    const row = rows[0];
    return {
      role: row?.role === "teacher" ? "teacher" : "student",
      isIdentityVerified: Boolean(row?.isIdentityVerified),
      hasActiveEntitlement: Boolean(row?.hasActiveEntitlement),
    };
  }

}
