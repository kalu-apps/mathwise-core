import { Injectable } from "@nestjs/common";
import { DatabaseService, type DatabaseExecutor } from "../db/database.service";
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
    await this.databaseService.execute(
      `
        INSERT INTO profile_purchases (
          id,
          user_id,
          course_id,
          price,
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
          $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          course_id = EXCLUDED.course_id,
          price = EXCLUDED.price,
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
        purchase.purchasedAt,
        purchase.paymentMethod ?? null,
        purchase.checkoutId ?? null,
        JSON.stringify(purchase.bnpl ?? null),
        JSON.stringify(purchase.courseSnapshot ?? null),
        JSON.stringify(purchase.lessonsSnapshot ?? null),
        JSON.stringify(purchase.purchasedTestItemIds ?? null),
      ]
    );
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
          currency,
          state,
          provider_payment_id,
          provider_event_id,
          consent_snapshot_json,
          created_at,
          updated_at,
          expires_at,
          updated_at_ts
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15::jsonb, $16, $17, $18, NOW()
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
        checkout.currency,
        checkout.state,
        checkout.providerPaymentId ?? null,
        checkout.providerEventId ?? null,
        JSON.stringify(checkout.consentSnapshot ?? null),
        checkout.createdAt,
        checkout.updatedAt,
        checkout.expiresAt ?? null,
      ]
    );
  }

  async updateCheckout(checkout: CheckoutProcessDto): Promise<void> {
    await this.databaseService.execute(
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
          currency = $11,
          state = $12,
          provider_payment_id = $13,
          provider_event_id = $14,
          consent_snapshot_json = $15::jsonb,
          created_at = $16,
          updated_at = $17,
          expires_at = $18,
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
        checkout.currency,
        checkout.state,
        checkout.providerPaymentId ?? null,
        checkout.providerEventId ?? null,
        JSON.stringify(checkout.consentSnapshot ?? null),
        checkout.createdAt,
        checkout.updatedAt,
        checkout.expiresAt ?? null,
      ]
    );
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
          currency,
          state,
          provider_payment_id AS "providerPaymentId",
          provider_event_id AS "providerEventId",
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
          currency,
          state,
          provider_payment_id AS "providerPaymentId",
          provider_event_id AS "providerEventId",
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
          currency,
          state,
          provider_payment_id AS "providerPaymentId",
          provider_event_id AS "providerEventId",
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
    await this.databaseService.execute(
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
  }

  async setCourseEntitlement(
    userId: string,
    courseId: string,
    hasActiveEntitlement: boolean
  ): Promise<void> {
    await this.databaseService.execute(
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
      [userId, courseId, hasActiveEntitlement]
    );
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
    await this.databaseService.execute(
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
      await this.upsertPurchaseWithExecutor(tx, params.purchase);
      await this.ensureAccessContextWithExecutor(tx, {
        userId: params.accessContext.userId,
        email: params.accessContext.email,
        role: params.accessContext.role,
        isIdentityVerified: params.accessContext.isIdentityVerified,
      });
      await this.setCourseEntitlementWithExecutor(tx, {
        userId: params.accessContext.userId,
        courseId: params.accessContext.courseId,
        hasActiveEntitlement: params.accessContext.hasActiveEntitlement,
      });
      await this.upsertCourseEntitlementWithExecutor(tx, {
        id: params.entitlement.id,
        userId: params.accessContext.userId,
        courseId: params.accessContext.courseId,
        purchaseId: params.purchase.id,
        checkoutId: params.checkout.id,
        state: params.entitlement.state,
        createdAt: params.entitlement.createdAt,
        updatedAt: params.entitlement.updatedAt,
      });
      await this.updateCheckoutWithExecutor(tx, params.checkout);
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

  private async upsertPurchaseWithExecutor(
    executor: DatabaseExecutor,
    purchase: PurchaseRecordDto
  ): Promise<void> {
    await executor.execute(
      `
        INSERT INTO profile_purchases (
          id,
          user_id,
          course_id,
          price,
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
          $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          course_id = EXCLUDED.course_id,
          price = EXCLUDED.price,
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
        purchase.purchasedAt,
        purchase.paymentMethod ?? null,
        purchase.checkoutId ?? null,
        JSON.stringify(purchase.bnpl ?? null),
        JSON.stringify(purchase.courseSnapshot ?? null),
        JSON.stringify(purchase.lessonsSnapshot ?? null),
        JSON.stringify(purchase.purchasedTestItemIds ?? null),
      ]
    );
  }

  private async ensureAccessContextWithExecutor(
    executor: DatabaseExecutor,
    params: {
      userId: string;
      email: string;
      role: "student" | "teacher";
      isIdentityVerified: boolean;
    }
  ): Promise<void> {
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
  }

  private async setCourseEntitlementWithExecutor(
    executor: DatabaseExecutor,
    params: {
      userId: string;
      courseId: string;
      hasActiveEntitlement: boolean;
    }
  ): Promise<void> {
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
  }

  private async upsertCourseEntitlementWithExecutor(
    executor: DatabaseExecutor,
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
  ): Promise<void> {
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
  }

  private async updateCheckoutWithExecutor(
    executor: DatabaseExecutor,
    checkout: CheckoutProcessDto
  ): Promise<void> {
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
          currency = $11,
          state = $12,
          provider_payment_id = $13,
          provider_event_id = $14,
          consent_snapshot_json = $15::jsonb,
          created_at = $16,
          updated_at = $17,
          expires_at = $18,
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
        checkout.currency,
        checkout.state,
        checkout.providerPaymentId ?? null,
        checkout.providerEventId ?? null,
        JSON.stringify(checkout.consentSnapshot ?? null),
        checkout.createdAt,
        checkout.updatedAt,
        checkout.expiresAt ?? null,
      ]
    );
  }
}
