export const PURCHASES_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS profile_purchases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      tariff TEXT CHECK (tariff IN ('standard', 'premium')),
      purchased_at TEXT NOT NULL,
      payment_method TEXT,
      checkout_id TEXT,
      bnpl_json JSONB,
      course_snapshot_json JSONB,
      lessons_snapshot_json JSONB,
      purchased_test_item_ids_json JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_profile_purchases_user_course
    ON profile_purchases (user_id, course_id, purchased_at DESC)
  `,
  `
    CREATE TABLE IF NOT EXISTS checkout_processes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      course_id TEXT NOT NULL,
      method TEXT NOT NULL CHECK (method IN ('mock', 'card', 'sbp', 'bnpl')),
      bnpl_installments_count INTEGER,
      amount INTEGER NOT NULL DEFAULT 0,
      tariff TEXT CHECK (tariff IN ('standard', 'premium')),
      currency TEXT NOT NULL DEFAULT 'RUB',
      state TEXT NOT NULL CHECK (
        state IN (
          'created',
          'pending_provider',
          'provider_confirmed',
          'provision_pending',
          'provisioned',
          'email_verification_pending',
          'email_correction_required',
          'failed',
          'provision_failed_retryable',
          'canceled',
          'expired'
        )
      ),
      provider_payment_id TEXT,
      provider_event_id TEXT,
      consent_snapshot_json JSONB,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `ALTER TABLE profile_purchases ADD COLUMN IF NOT EXISTS tariff TEXT CHECK (tariff IN ('standard', 'premium'))`,
  `ALTER TABLE checkout_processes ADD COLUMN IF NOT EXISTS tariff TEXT CHECK (tariff IN ('standard', 'premium'))`,
  `ALTER TABLE checkout_processes ADD COLUMN IF NOT EXISTS first_name TEXT`,
  `ALTER TABLE checkout_processes ADD COLUMN IF NOT EXISTS last_name TEXT`,
  `ALTER TABLE checkout_processes ADD COLUMN IF NOT EXISTS phone TEXT`,
  `ALTER TABLE checkout_processes ADD COLUMN IF NOT EXISTS provider_payment_id TEXT`,
  `ALTER TABLE checkout_processes ADD COLUMN IF NOT EXISTS provider_event_id TEXT`,
  `ALTER TABLE checkout_processes ADD COLUMN IF NOT EXISTS consent_snapshot_json JSONB`,
  `
    CREATE INDEX IF NOT EXISTS idx_checkout_processes_user
    ON checkout_processes (user_id, updated_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_checkout_processes_email
    ON checkout_processes (email, updated_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_checkout_processes_active_course
    ON checkout_processes (course_id, user_id, state, updated_at DESC)
  `,
  `
    CREATE TABLE IF NOT EXISTS checkout_timeline_events (
      id TEXT PRIMARY KEY,
      checkout_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TEXT NOT NULL,
      updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_checkout_timeline_checkout
    ON checkout_timeline_events (checkout_id, created_at ASC)
  `,
  `
    CREATE TABLE IF NOT EXISTS write_idempotency_records (
      scope TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      response_json JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope, idempotency_key)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS access_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
      is_identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS user_course_access (
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      has_active_entitlement BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, course_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS course_entitlements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      purchase_id TEXT NOT NULL,
      checkout_id TEXT,
      state TEXT NOT NULL CHECK (state IN ('active', 'revoked', 'expired')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, course_id, purchase_id)
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_course_entitlements_user_course
    ON course_entitlements (user_id, course_id, updated_at DESC)
  `,
  `
    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      checkout_id TEXT NOT NULL,
      status TEXT NOT NULL,
      outcome TEXT NOT NULL,
      payload_json JSONB,
      created_at TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_provider_external
    ON payment_events (provider, external_event_id)
  `,
  `
    CREATE TABLE IF NOT EXISTS consent_records (
      id TEXT PRIMARY KEY,
      checkout_id TEXT NOT NULL,
      email TEXT NOT NULL,
      scope TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (checkout_id, scope)
    )
  `,
  `
    DELETE FROM write_idempotency_records
    WHERE expires_at <= NOW()
  `,
] as const;
