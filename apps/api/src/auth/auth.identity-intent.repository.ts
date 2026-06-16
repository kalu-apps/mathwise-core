import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type {
  AuthIdentityIntentChannel,
  AuthIdentityIntentConflictReason,
  AuthIdentityIntentState,
} from "./auth.types";

type AuthIdentityIntentRow = {
  id: string;
  channel: AuthIdentityIntentChannel;
  identityValue: string;
  identityEmail: string | null;
  verificationState: AuthIdentityIntentState;
  conflictReason: AuthIdentityIntentConflictReason | null;
  existingUserId: string | null;
  challengeCodeHash: string | null;
  challengeAttempts: number;
  challengeMaxAttempts: number;
  metadata: unknown;
  verifiedAt: string | null;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthIdentityIntentRecord = {
  id: string;
  channel: AuthIdentityIntentChannel;
  identityValue: string;
  identityEmail?: string;
  verificationState: AuthIdentityIntentState;
  conflictReason?: AuthIdentityIntentConflictReason;
  existingUserId?: string;
  challengeCodeHash?: string;
  challengeAttempts: number;
  challengeMaxAttempts: number;
  metadata: Record<string, unknown>;
  verifiedAt?: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AuthIdentityIntentRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS auth_identity_intents (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL CHECK (channel IN ('email')),
        identity_value TEXT NOT NULL,
        identity_email TEXT,
        verification_state TEXT NOT NULL CHECK (verification_state IN ('pending', 'verified', 'expired', 'consumed', 'conflict')),
        conflict_reason TEXT,
        existing_user_id TEXT,
        challenge_code_hash TEXT,
        challenge_attempts INTEGER NOT NULL DEFAULT 0,
        challenge_max_attempts INTEGER NOT NULL DEFAULT 6,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        verified_at TEXT,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_auth_identity_intents_lookup
      ON auth_identity_intents (channel, identity_value, created_at DESC)
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_auth_identity_intents_state_expires
      ON auth_identity_intents (verification_state, expires_at DESC)
    `);
  }

  async expireActiveByIdentity(params: {
    channel: AuthIdentityIntentChannel;
    identityValue: string;
    now: string;
  }): Promise<void> {
    await this.databaseService.execute(
      `
        UPDATE auth_identity_intents
        SET
          verification_state = 'expired',
          updated_at = $3,
          updated_at_ts = NOW()
        WHERE channel = $1
          AND identity_value = $2
          AND verification_state IN ('pending', 'verified')
          AND consumed_at IS NULL
      `,
      [params.channel, params.identityValue, params.now]
    );
  }

  async createPendingEmailIntent(params: {
    id: string;
    email: string;
    codeHash: string;
    expiresAt: string;
    maxAttempts: number;
    metadata?: Record<string, unknown>;
  }): Promise<AuthIdentityIntentRecord> {
    const now = new Date().toISOString();
    const rows = await this.databaseService.query<AuthIdentityIntentRow>(
      `
        INSERT INTO auth_identity_intents (
          id,
          channel,
          identity_value,
          identity_email,
          verification_state,
          challenge_code_hash,
          challenge_attempts,
          challenge_max_attempts,
          metadata_json,
          verified_at,
          expires_at,
          consumed_at,
          created_at,
          updated_at,
          updated_at_ts
        )
        VALUES (
          $1,
          'email',
          $2,
          $2,
          'pending',
          $3,
          0,
          $4,
          $5::jsonb,
          NULL,
          $6,
          NULL,
          $7,
          $7,
          NOW()
        )
        RETURNING
          id,
          channel,
          identity_value AS "identityValue",
          identity_email AS "identityEmail",
          verification_state AS "verificationState",
          conflict_reason AS "conflictReason",
          existing_user_id AS "existingUserId",
          challenge_code_hash AS "challengeCodeHash",
          challenge_attempts AS "challengeAttempts",
          challenge_max_attempts AS "challengeMaxAttempts",
          metadata_json AS metadata,
          verified_at AS "verifiedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        params.id,
        params.email,
        params.codeHash,
        params.maxAttempts,
        JSON.stringify(params.metadata ?? {}),
        params.expiresAt,
        now,
      ]
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Failed to create identity intent");
    }
    return this.mapRow(row);
  }

  async findById(intentId: string): Promise<AuthIdentityIntentRecord | null> {
    const rows = await this.databaseService.query<AuthIdentityIntentRow>(
      `
        SELECT
          id,
          channel,
          identity_value AS "identityValue",
          identity_email AS "identityEmail",
          verification_state AS "verificationState",
          conflict_reason AS "conflictReason",
          existing_user_id AS "existingUserId",
          challenge_code_hash AS "challengeCodeHash",
          challenge_attempts AS "challengeAttempts",
          challenge_max_attempts AS "challengeMaxAttempts",
          metadata_json AS metadata,
          verified_at AS "verifiedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM auth_identity_intents
        WHERE id = $1
        LIMIT 1
      `,
      [intentId]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async incrementChallengeAttempts(params: {
    intentId: string;
    now: string;
  }): Promise<AuthIdentityIntentRecord | null> {
    const rows = await this.databaseService.query<AuthIdentityIntentRow>(
      `
        UPDATE auth_identity_intents
        SET
          challenge_attempts = challenge_attempts + 1,
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
        RETURNING
          id,
          channel,
          identity_value AS "identityValue",
          identity_email AS "identityEmail",
          verification_state AS "verificationState",
          conflict_reason AS "conflictReason",
          existing_user_id AS "existingUserId",
          challenge_code_hash AS "challengeCodeHash",
          challenge_attempts AS "challengeAttempts",
          challenge_max_attempts AS "challengeMaxAttempts",
          metadata_json AS metadata,
          verified_at AS "verifiedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [params.intentId, params.now]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async markVerified(params: {
    intentId: string;
    now: string;
  }): Promise<AuthIdentityIntentRecord | null> {
    const rows = await this.databaseService.query<AuthIdentityIntentRow>(
      `
        UPDATE auth_identity_intents
        SET
          verification_state = 'verified',
          verified_at = $2,
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
          AND verification_state = 'pending'
          AND consumed_at IS NULL
        RETURNING
          id,
          channel,
          identity_value AS "identityValue",
          identity_email AS "identityEmail",
          verification_state AS "verificationState",
          conflict_reason AS "conflictReason",
          existing_user_id AS "existingUserId",
          challenge_code_hash AS "challengeCodeHash",
          challenge_attempts AS "challengeAttempts",
          challenge_max_attempts AS "challengeMaxAttempts",
          metadata_json AS metadata,
          verified_at AS "verifiedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [params.intentId, params.now]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async markConflict(params: {
    intentId: string;
    now: string;
    reason: AuthIdentityIntentConflictReason;
    existingUserId?: string;
  }): Promise<AuthIdentityIntentRecord | null> {
    const rows = await this.databaseService.query<AuthIdentityIntentRow>(
      `
        UPDATE auth_identity_intents
        SET
          verification_state = 'conflict',
          conflict_reason = $3,
          existing_user_id = $4,
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
          AND verification_state IN ('pending', 'verified')
          AND consumed_at IS NULL
        RETURNING
          id,
          channel,
          identity_value AS "identityValue",
          identity_email AS "identityEmail",
          verification_state AS "verificationState",
          conflict_reason AS "conflictReason",
          existing_user_id AS "existingUserId",
          challenge_code_hash AS "challengeCodeHash",
          challenge_attempts AS "challengeAttempts",
          challenge_max_attempts AS "challengeMaxAttempts",
          metadata_json AS metadata,
          verified_at AS "verifiedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [params.intentId, params.now, params.reason, params.existingUserId ?? null]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async markExpired(params: {
    intentId: string;
    now: string;
  }): Promise<AuthIdentityIntentRecord | null> {
    const rows = await this.databaseService.query<AuthIdentityIntentRow>(
      `
        UPDATE auth_identity_intents
        SET
          verification_state = 'expired',
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
          AND verification_state IN ('pending', 'verified')
          AND consumed_at IS NULL
        RETURNING
          id,
          channel,
          identity_value AS "identityValue",
          identity_email AS "identityEmail",
          verification_state AS "verificationState",
          conflict_reason AS "conflictReason",
          existing_user_id AS "existingUserId",
          challenge_code_hash AS "challengeCodeHash",
          challenge_attempts AS "challengeAttempts",
          challenge_max_attempts AS "challengeMaxAttempts",
          metadata_json AS metadata,
          verified_at AS "verifiedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [params.intentId, params.now]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async consumeVerifiedIntent(params: {
    intentId: string;
    now: string;
  }): Promise<AuthIdentityIntentRecord | null> {
    const rows = await this.databaseService.query<AuthIdentityIntentRow>(
      `
        UPDATE auth_identity_intents
        SET
          verification_state = 'consumed',
          consumed_at = $2,
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
          AND verification_state = 'verified'
          AND consumed_at IS NULL
        RETURNING
          id,
          channel,
          identity_value AS "identityValue",
          identity_email AS "identityEmail",
          verification_state AS "verificationState",
          conflict_reason AS "conflictReason",
          existing_user_id AS "existingUserId",
          challenge_code_hash AS "challengeCodeHash",
          challenge_attempts AS "challengeAttempts",
          challenge_max_attempts AS "challengeMaxAttempts",
          metadata_json AS metadata,
          verified_at AS "verifiedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [params.intentId, params.now]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: AuthIdentityIntentRow): AuthIdentityIntentRecord {
    return {
      id: row.id,
      channel: row.channel,
      identityValue: row.identityValue,
      identityEmail: row.identityEmail ?? undefined,
      verificationState: row.verificationState,
      conflictReason: row.conflictReason ?? undefined,
      existingUserId: row.existingUserId ?? undefined,
      challengeCodeHash: row.challengeCodeHash ?? undefined,
      challengeAttempts: Number(row.challengeAttempts) || 0,
      challengeMaxAttempts: Number(row.challengeMaxAttempts) || 0,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {},
      verifiedAt: row.verifiedAt ?? undefined,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
