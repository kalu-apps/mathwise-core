import { Injectable } from "@nestjs/common";
import { DatabaseService, type DatabaseExecutor } from "../db/database.service";
import type {
  CheckoutListItemDto,
  CheckoutProcessDto,
  CheckoutStateDto,
  PurchaseRecordDto,
} from "./purchases.types";

type PurchaseRow = {
  id: string;
  userId: string;
  courseId: string;
  price: number;
  purchasedAt: string;
  paymentMethod: string | null;
  checkoutId: string | null;
  bnpl: unknown;
  courseSnapshot: unknown;
  lessonsSnapshot: unknown;
  purchasedTestItemIds: unknown;
};

type CheckoutRow = {
  id: string;
  userId: string | null;
  email: string;
  courseId: string;
  method: "mock" | "card" | "sbp" | "bnpl";
  bnplInstallmentsCount: number | null;
  amount: number;
  currency: string;
  state: CheckoutStateDto;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

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

const normalizePurchasedTestItemIds = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
};

@Injectable()
export class PurchasesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS profile_purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        price INTEGER NOT NULL DEFAULT 0,
        purchased_at TEXT NOT NULL,
        payment_method TEXT,
        checkout_id TEXT,
        bnpl_json JSONB,
        course_snapshot_json JSONB,
        lessons_snapshot_json JSONB,
        purchased_test_item_ids_json JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_purchases_user_course
      ON profile_purchases (user_id, course_id, purchased_at DESC)
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS checkout_processes (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        email TEXT NOT NULL,
        course_id TEXT NOT NULL,
        method TEXT NOT NULL CHECK (method IN ('mock', 'card', 'sbp', 'bnpl')),
        bnpl_installments_count INTEGER,
        amount INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'RUB',
        state TEXT NOT NULL CHECK (
          state IN (
            'created',
            'awaiting_payment',
            'paid',
            'failed',
            'canceled',
            'expired',
            'provisioning',
            'provisioned'
          )
        ),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_checkout_processes_user
      ON checkout_processes (user_id, updated_at DESC)
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_checkout_processes_email
      ON checkout_processes (email, updated_at DESC)
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_checkout_processes_active_course
      ON checkout_processes (course_id, user_id, state, updated_at DESC)
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS checkout_timeline_events (
        id TEXT PRIMARY KEY,
        checkout_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_checkout_timeline_checkout
      ON checkout_timeline_events (checkout_id, created_at ASC)
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS write_idempotency_records (
        scope TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        response_json JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (scope, idempotency_key)
      )
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS access_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
        is_identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS user_course_access (
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        has_active_entitlement BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, course_id)
      )
    `);

    await this.databaseService.execute(`
      DELETE FROM write_idempotency_records
      WHERE expires_at <= NOW()
    `);
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
    return rows.map((row) => this.mapPurchaseRow(row));
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
    return row ? this.mapPurchaseRow(row) : null;
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
    return row ? this.mapPurchaseRow(row) : null;
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
          course_id,
          method,
          bnpl_installments_count,
          amount,
          currency,
          state,
          created_at,
          updated_at,
          expires_at,
          updated_at_ts
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, NOW()
        )
      `,
      [
        checkout.id,
        checkout.userId ?? null,
        checkout.email,
        checkout.courseId,
        checkout.method,
        checkout.bnplInstallmentsCount ?? null,
        Math.max(0, Math.round(checkout.amount)),
        checkout.currency,
        checkout.state,
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
          course_id = $4,
          method = $5,
          bnpl_installments_count = $6,
          amount = $7,
          currency = $8,
          state = $9,
          created_at = $10,
          updated_at = $11,
          expires_at = $12,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [
        checkout.id,
        checkout.userId ?? null,
        checkout.email,
        checkout.courseId,
        checkout.method,
        checkout.bnplInstallmentsCount ?? null,
        Math.max(0, Math.round(checkout.amount)),
        checkout.currency,
        checkout.state,
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
          course_id AS "courseId",
          method,
          bnpl_installments_count AS "bnplInstallmentsCount",
          amount,
          currency,
          state,
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
    return row ? this.mapCheckoutRow(row) : null;
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
          course_id AS "courseId",
          method,
          bnpl_installments_count AS "bnplInstallmentsCount",
          amount,
          currency,
          state,
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
    return rows.map((row) => this.mapCheckoutRow(row));
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
          course_id AS "courseId",
          method,
          bnpl_installments_count AS "bnplInstallmentsCount",
          amount,
          currency,
          state,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          expires_at AS "expiresAt"
        FROM checkout_processes
        WHERE course_id = $1
          AND (
            ($2::text IS NOT NULL AND user_id = $2)
            OR LOWER(email) = LOWER($3)
          )
          AND state IN ('created', 'awaiting_payment', 'paid', 'provisioning')
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      [params.courseId, params.userId ?? null, params.email]
    );
    const row = rows[0];
    return row ? this.mapCheckoutRow(row) : null;
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

  private mapPurchaseRow(row: PurchaseRow): PurchaseRecordDto {
    return {
      id: row.id,
      userId: row.userId,
      courseId: row.courseId,
      price: Number(row.price),
      purchasedAt: row.purchasedAt,
      paymentMethod: row.paymentMethod ?? undefined,
      checkoutId: row.checkoutId ?? undefined,
      bnpl: row.bnpl ?? undefined,
      courseSnapshot:
        row.courseSnapshot && typeof row.courseSnapshot === "object"
          ? row.courseSnapshot
          : undefined,
      lessonsSnapshot: Array.isArray(row.lessonsSnapshot)
        ? row.lessonsSnapshot
        : undefined,
      purchasedTestItemIds: normalizePurchasedTestItemIds(row.purchasedTestItemIds),
    };
  }

  private mapCheckoutRow(row: CheckoutRow): CheckoutProcessDto {
    return {
      id: row.id,
      userId: row.userId ?? undefined,
      email: row.email,
      courseId: row.courseId,
      method: row.method,
      bnplInstallmentsCount:
        row.bnplInstallmentsCount && Number.isFinite(row.bnplInstallmentsCount)
          ? Math.max(1, Math.floor(row.bnplInstallmentsCount))
          : undefined,
      amount: Number(row.amount),
      currency: row.currency || "RUB",
      state: row.state,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt ?? undefined,
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
          course_id = $4,
          method = $5,
          bnpl_installments_count = $6,
          amount = $7,
          currency = $8,
          state = $9,
          created_at = $10,
          updated_at = $11,
          expires_at = $12,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [
        checkout.id,
        checkout.userId ?? null,
        checkout.email,
        checkout.courseId,
        checkout.method,
        checkout.bnplInstallmentsCount ?? null,
        Math.max(0, Math.round(checkout.amount)),
        checkout.currency,
        checkout.state,
        checkout.createdAt,
        checkout.updatedAt,
        checkout.expiresAt ?? null,
      ]
    );
  }
}
