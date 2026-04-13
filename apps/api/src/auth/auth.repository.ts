import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type { AuthSocialProvider, AuthUserDto } from "./auth.types";

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

type AuthUserIdentityRow = {
  id: string;
  userId: string;
  provider: AuthSocialProvider;
  providerUserId: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthUserIdentity = {
  id: string;
  userId: string;
  provider: AuthSocialProvider;
  providerUserId: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
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
      CREATE TABLE IF NOT EXISTS auth_user_identities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK (provider IN ('google', 'yandex', 'vk')),
        provider_user_id TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (provider, provider_user_id),
        UNIQUE (user_id, provider)
      )
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_auth_user_identities_user_provider
      ON auth_user_identities (user_id, provider)
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

  async findIdentityByProvider(params: {
    provider: AuthSocialProvider;
    providerUserId: string;
  }): Promise<AuthUserIdentity | null> {
    const rows = await this.databaseService.query<AuthUserIdentityRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          provider,
          provider_user_id AS "providerUserId",
          email,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM auth_user_identities
        WHERE provider = $1
          AND provider_user_id = $2
        LIMIT 1
      `,
      [params.provider, params.providerUserId]
    );
    const row = rows[0];
    return row ? this.mapIdentity(row) : null;
  }

  async findIdentityByUserAndProvider(params: {
    userId: string;
    provider: AuthSocialProvider;
  }): Promise<AuthUserIdentity | null> {
    const rows = await this.databaseService.query<AuthUserIdentityRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          provider,
          provider_user_id AS "providerUserId",
          email,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM auth_user_identities
        WHERE user_id = $1
          AND provider = $2
        LIMIT 1
      `,
      [params.userId, params.provider]
    );
    const row = rows[0];
    return row ? this.mapIdentity(row) : null;
  }

  async upsertIdentity(params: {
    id: string;
    userId: string;
    provider: AuthSocialProvider;
    providerUserId: string;
    email?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        INSERT INTO auth_user_identities (
          id,
          user_id,
          provider,
          provider_user_id,
          email,
          created_at,
          updated_at,
          updated_at_ts
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, NOW())
        ON CONFLICT (provider, provider_user_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          email = COALESCE(EXCLUDED.email, auth_user_identities.email),
          updated_at = EXCLUDED.updated_at,
          updated_at_ts = NOW()
      `,
      [
        params.id,
        params.userId,
        params.provider,
        params.providerUserId,
        params.email ?? null,
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

  private mapIdentity(row: AuthUserIdentityRow): AuthUserIdentity {
    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider,
      providerUserId: row.providerUserId,
      email: row.email ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
