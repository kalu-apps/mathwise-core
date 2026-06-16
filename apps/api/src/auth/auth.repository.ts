import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type { AuthIdentityCompletionStateDto, AuthUserDto } from "./auth.types";

type AuthUserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "student" | "teacher";
  phone: string | null;
  photo: string | null;
  passwordHash: string | null;
  updatedAt: string | null;
};

export type RecoveryArtifactRow = {
  id: string;
  email: string;
  userId: string;
  codeHash: string;
  recoveryTokenHash: string | null;
  state: "issued" | "verified" | "consumed" | "expired";
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  consumedAt: string | null;
};

type AuthIdentityCompletionRow = {
  userId: string;
  identityVerifiedAt: string | null;
  accountFinalizedAt: string | null;
  firstPasswordSetAt: string | null;
  completionState: AuthIdentityCompletionStateDto;
  completedAt: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthIdentityCompletionRecord = {
  userId: string;
  identityVerifiedAt?: string;
  accountFinalizedAt?: string;
  firstPasswordSetAt?: string;
  completionState: AuthIdentityCompletionStateDto;
  completedAt?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AuthRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
        phone TEXT,
        photo TEXT,
        password_hash TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.databaseService.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email_lower
      ON auth_users (LOWER(email))
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        phone TEXT,
        initialized_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS auth_recovery_artifacts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        recovery_token_hash TEXT,
        state TEXT NOT NULL CHECK (state IN ('issued', 'verified', 'consumed', 'expired')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 6,
        expires_at TEXT NOT NULL,
        token_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        consumed_at TEXT,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_auth_recovery_email_state
      ON auth_recovery_artifacts (LOWER(email), state, created_at DESC)
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_auth_recovery_user_state
      ON auth_recovery_artifacts (user_id, state, created_at DESC)
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS auth_identity_completions (
        user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
        identity_verified_at TEXT,
        account_finalized_at TEXT,
        first_password_set_at TEXT,
        completion_state TEXT NOT NULL CHECK (
          completion_state IN (
            'pending_identity_verification',
            'pending_account_finalization',
            'pending_first_password',
            'completed'
          )
        ),
        completed_at TEXT,
        source TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_auth_identity_completions_state
      ON auth_identity_completions (completion_state, updated_at DESC)
    `);
  }

  async hasAnyUsers(): Promise<boolean> {
    const rows = await this.databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM auth_users"
    );
    return Number(rows[0]?.count ?? 0) > 0;
  }

  async findByEmail(email: string): Promise<(AuthUserDto & { passwordHash: string | null }) | null> {
    const rows = await this.databaseService.query<AuthUserRow>(
      `
        SELECT
          id,
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          role,
          phone,
          photo,
          password_hash AS "passwordHash",
          NULL::text AS "updatedAt"
        FROM auth_users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email]
    );
    const row = rows[0];
    return row ? this.mapRowWithPassword(row) : null;
  }

  async findById(userId: string): Promise<AuthUserDto | null> {
    const rows = await this.databaseService.query<AuthUserRow>(
      `
        SELECT
          id,
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          role,
          phone,
          photo,
          password_hash AS "passwordHash",
          NULL::text AS "updatedAt"
        FROM auth_users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async findByIdWithCredential(
    userId: string
  ): Promise<(AuthUserDto & { passwordHash: string | null; updatedAt: string }) | null> {
    const rows = await this.databaseService.query<AuthUserRow>(
      `
        SELECT
          id,
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          role,
          phone,
          photo,
          password_hash AS "passwordHash",
          TO_CHAR(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
        FROM auth_users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ...this.mapRow(row),
      passwordHash: row.passwordHash,
      updatedAt: row.updatedAt ?? new Date().toISOString(),
    };
  }

  async findByRole(role: "student" | "teacher"): Promise<AuthUserDto[]> {
    const rows = await this.databaseService.query<AuthUserRow>(
      `
        SELECT
          id,
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          role,
          phone,
          photo,
          password_hash AS "passwordHash",
          NULL::text AS "updatedAt"
        FROM auth_users
        WHERE role = $1
        ORDER BY last_name ASC, first_name ASC, id ASC
      `,
      [role]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async createUser(params: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "student" | "teacher";
    phone?: string;
    passwordHash?: string | null;
  }): Promise<AuthUserDto> {
    await this.databaseService.execute(
      `
        INSERT INTO auth_users (
          id,
          email,
          first_name,
          last_name,
          role,
          phone,
          password_hash,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
      [
        params.id,
        params.email,
        params.firstName,
        params.lastName,
        params.role,
        params.phone ?? null,
        params.passwordHash ?? null,
      ]
    );
    await this.ensureProfileBootstrap({
      userId: params.id,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
    });
    const created = await this.findById(params.id);
    if (!created) {
      throw new Error("Failed to create auth user");
    }
    return created;
  }

  async updateUserProfile(params: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    photo?: string;
  }): Promise<AuthUserDto | null> {
    const current = await this.findById(params.userId);
    if (!current) return null;

    const firstName =
      typeof params.firstName === "string"
        ? params.firstName.trim()
        : current.firstName;
    const lastName =
      typeof params.lastName === "string"
        ? params.lastName.trim()
        : current.lastName;
    const phone =
      typeof params.phone === "string" && params.phone.trim().length > 0
        ? params.phone.trim()
        : null;
    const photo =
      typeof params.photo === "string" && params.photo.trim().length > 0
        ? params.photo.trim()
        : null;

    await this.databaseService.execute(
      `
        UPDATE auth_users
        SET
          first_name = $2,
          last_name = $3,
          phone = $4,
          photo = $5,
          updated_at = NOW()
        WHERE id = $1
      `,
      [params.userId, firstName, lastName, phone, photo]
    );

    await this.ensureProfileBootstrap({
      userId: params.userId,
      email: current.email,
      firstName,
      lastName,
      phone: phone ?? undefined,
    });

    return this.findById(params.userId);
  }

  async ensureProfileBootstrap(params: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        INSERT INTO user_profiles (
          user_id,
          email,
          first_name,
          last_name,
          phone,
          initialized_at,
          updated_at,
          updated_at_ts
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          email = EXCLUDED.email,
          first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), user_profiles.first_name),
          last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), user_profiles.last_name),
          phone = COALESCE(EXCLUDED.phone, user_profiles.phone),
          updated_at = EXCLUDED.updated_at,
          updated_at_ts = NOW()
      `,
      [
        params.userId,
        params.email,
        params.firstName,
        params.lastName,
        params.phone ?? null,
        now,
      ]
    );
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.databaseService.execute(
      `
        UPDATE auth_users
        SET password_hash = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [userId, passwordHash]
    );
  }

  async insertRecoveryArtifact(params: {
    id: string;
    email: string;
    userId: string;
    codeHash: string;
    maxAttempts: number;
    expiresAt: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        INSERT INTO auth_recovery_artifacts (
          id,
          email,
          user_id,
          code_hash,
          recovery_token_hash,
          state,
          attempts,
          max_attempts,
          expires_at,
          token_expires_at,
          created_at,
          updated_at,
          consumed_at,
          updated_at_ts
        )
        VALUES ($1, $2, $3, $4, NULL, 'issued', 0, $5, $6, NULL, $7, $7, NULL, NOW())
      `,
      [
        params.id,
        params.email,
        params.userId,
        params.codeHash,
        params.maxAttempts,
        params.expiresAt,
        now,
      ]
    );
  }

  async findLatestRecoveryArtifactByEmail(
    email: string
  ): Promise<RecoveryArtifactRow | null> {
    const rows = await this.databaseService.query<RecoveryArtifactRow>(
      `
        SELECT
          id,
          email,
          user_id AS "userId",
          code_hash AS "codeHash",
          recovery_token_hash AS "recoveryTokenHash",
          state,
          attempts,
          max_attempts AS "maxAttempts",
          expires_at AS "expiresAt",
          token_expires_at AS "tokenExpiresAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          consumed_at AS "consumedAt"
        FROM auth_recovery_artifacts
        WHERE LOWER(email) = LOWER($1)
          AND state IN ('issued', 'verified')
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [email]
    );
    return rows[0] ?? null;
  }

  async incrementRecoveryAttempts(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        UPDATE auth_recovery_artifacts
        SET attempts = attempts + 1,
            updated_at = $2,
            updated_at_ts = NOW()
        WHERE id = $1
      `,
      [id, now]
    );
  }

  async setRecoveryVerified(params: {
    id: string;
    recoveryTokenHash: string;
    tokenExpiresAt: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        UPDATE auth_recovery_artifacts
        SET
          state = 'verified',
          recovery_token_hash = $2,
          token_expires_at = $3,
          updated_at = $4,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [params.id, params.recoveryTokenHash, params.tokenExpiresAt, now]
    );
  }

  async findVerifiedRecoveryArtifactByEmail(
    email: string
  ): Promise<RecoveryArtifactRow | null> {
    const rows = await this.databaseService.query<RecoveryArtifactRow>(
      `
        SELECT
          id,
          email,
          user_id AS "userId",
          code_hash AS "codeHash",
          recovery_token_hash AS "recoveryTokenHash",
          state,
          attempts,
          max_attempts AS "maxAttempts",
          expires_at AS "expiresAt",
          token_expires_at AS "tokenExpiresAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          consumed_at AS "consumedAt"
        FROM auth_recovery_artifacts
        WHERE LOWER(email) = LOWER($1)
          AND state = 'verified'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [email]
    );
    return rows[0] ?? null;
  }

  async consumeRecoveryArtifact(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        UPDATE auth_recovery_artifacts
        SET
          state = 'consumed',
          consumed_at = $2,
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [id, now]
    );
  }

  async expireRecoveryArtifactsForEmail(email: string): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        UPDATE auth_recovery_artifacts
        SET
          state = 'expired',
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE LOWER(email) = LOWER($1)
          AND state IN ('issued', 'verified')
      `,
      [email, now]
    );
  }

  async ensureTeacherBootstrap(params: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
  }): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO auth_users (
          id,
          email,
          first_name,
          last_name,
          role,
          password_hash,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'teacher', $5, NOW())
        ON CONFLICT ((LOWER(email)))
        DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          role = 'teacher',
          password_hash = EXCLUDED.password_hash,
          updated_at = NOW()
      `,
      [
        params.id,
        params.email,
        params.firstName,
        params.lastName,
        params.passwordHash,
      ]
    );

    const user = await this.findByEmail(params.email);
    if (user) {
      await this.ensureProfileBootstrap({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
      });
    }
  }

  async findIdentityCompletionByUserId(
    userId: string
  ): Promise<AuthIdentityCompletionRecord | null> {
    const rows = await this.databaseService.query<AuthIdentityCompletionRow>(
      `
        SELECT
          user_id AS "userId",
          identity_verified_at AS "identityVerifiedAt",
          account_finalized_at AS "accountFinalizedAt",
          first_password_set_at AS "firstPasswordSetAt",
          completion_state AS "completionState",
          completed_at AS "completedAt",
          source,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM auth_identity_completions
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );
    const row = rows[0];
    return row ? this.mapIdentityCompletion(row) : null;
  }

  async upsertIdentityCompletion(params: {
    userId: string;
    identityVerifiedAt?: string | null;
    accountFinalizedAt?: string | null;
    firstPasswordSetAt?: string | null;
    completionState: AuthIdentityCompletionStateDto;
    completedAt?: string | null;
    source?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        INSERT INTO auth_identity_completions (
          user_id,
          identity_verified_at,
          account_finalized_at,
          first_password_set_at,
          completion_state,
          completed_at,
          source,
          created_at,
          updated_at,
          updated_at_ts
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          identity_verified_at = COALESCE(EXCLUDED.identity_verified_at, auth_identity_completions.identity_verified_at),
          account_finalized_at = COALESCE(EXCLUDED.account_finalized_at, auth_identity_completions.account_finalized_at),
          first_password_set_at = COALESCE(EXCLUDED.first_password_set_at, auth_identity_completions.first_password_set_at),
          completion_state = EXCLUDED.completion_state,
          completed_at = COALESCE(EXCLUDED.completed_at, auth_identity_completions.completed_at),
          source = COALESCE(EXCLUDED.source, auth_identity_completions.source),
          updated_at = EXCLUDED.updated_at,
          updated_at_ts = NOW()
      `,
      [
        params.userId,
        params.identityVerifiedAt ?? null,
        params.accountFinalizedAt ?? null,
        params.firstPasswordSetAt ?? null,
        params.completionState,
        params.completedAt ?? null,
        params.source ?? null,
        now,
      ]
    );
  }

  private mapRowWithPassword(
    row: AuthUserRow
  ): AuthUserDto & { passwordHash: string | null } {
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      phone: row.phone ?? undefined,
      photo: row.photo ?? undefined,
      passwordHash: row.passwordHash,
    };
  }

  private mapRow(row: AuthUserRow): AuthUserDto {
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      phone: row.phone ?? undefined,
      photo: row.photo ?? undefined,
    };
  }

  private mapIdentityCompletion(
    row: AuthIdentityCompletionRow
  ): AuthIdentityCompletionRecord {
    return {
      userId: row.userId,
      identityVerifiedAt: row.identityVerifiedAt ?? undefined,
      accountFinalizedAt: row.accountFinalizedAt ?? undefined,
      firstPasswordSetAt: row.firstPasswordSetAt ?? undefined,
      completionState: row.completionState,
      completedAt: row.completedAt ?? undefined,
      source: row.source ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
