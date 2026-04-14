export const BOOKINGS_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS profile_bookings (
      id TEXT PRIMARY KEY,
      slot_id TEXT,
      teacher_id TEXT NOT NULL,
      teacher_name TEXT NOT NULL DEFAULT '',
      teacher_photo TEXT,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL DEFAULT '',
      student_email TEXT NOT NULL DEFAULT '',
      student_phone TEXT,
      student_photo TEXT,
      date TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      lesson_kind TEXT NOT NULL CHECK (lesson_kind IN ('trial', 'regular')),
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'rescheduled', 'canceled', 'completed', 'no_show')),
      payment_status TEXT NOT NULL CHECK (payment_status IN ('unpaid', 'paid')),
      meeting_url TEXT,
      materials_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      consent_snapshot_json JSONB,
      identity_kind TEXT NOT NULL DEFAULT 'user_bound' CHECK (identity_kind IN ('user_bound', 'guest_pending')),
      identity_email_canonical TEXT NOT NULL DEFAULT '',
      canceled_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    ALTER TABLE profile_bookings
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled'
      CHECK (status IN ('scheduled', 'rescheduled', 'canceled', 'completed', 'no_show'))
  `,
  `
    ALTER TABLE profile_bookings
    ADD COLUMN IF NOT EXISTS consent_snapshot_json JSONB
  `,
  `
    ALTER TABLE profile_bookings
    ADD COLUMN IF NOT EXISTS identity_kind TEXT NOT NULL DEFAULT 'user_bound'
      CHECK (identity_kind IN ('user_bound', 'guest_pending'))
  `,
  `
    ALTER TABLE profile_bookings
    ADD COLUMN IF NOT EXISTS identity_email_canonical TEXT NOT NULL DEFAULT ''
  `,
  `
    ALTER TABLE profile_bookings
    ADD COLUMN IF NOT EXISTS canceled_at TEXT
  `,
  `
    ALTER TABLE profile_bookings
    ADD COLUMN IF NOT EXISTS slot_id TEXT
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_profile_bookings_student
    ON profile_bookings (student_id, date ASC, start_time ASC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_profile_bookings_teacher
    ON profile_bookings (teacher_id, date ASC, start_time ASC)
  `,
  `
    DROP INDEX IF EXISTS idx_profile_bookings_teacher_time_unique
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_bookings_teacher_time_unique
    ON profile_bookings (teacher_id, date, start_time, end_time)
    WHERE status IN ('scheduled', 'rescheduled')
  `,
  `
    DROP INDEX IF EXISTS idx_profile_bookings_slot_unique
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_bookings_slot_unique
    ON profile_bookings (slot_id)
    WHERE slot_id IS NOT NULL
      AND status IN ('scheduled', 'rescheduled')
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_profile_bookings_identity_lookup
    ON profile_bookings (identity_kind, identity_email_canonical, date ASC, start_time ASC)
  `,
  `
    CREATE TABLE IF NOT EXISTS profile_teacher_availability (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS booking_slot_holds (
      id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      teacher_name TEXT NOT NULL DEFAULT '',
      teacher_photo TEXT,
      date TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      initiated_by_user_id TEXT,
      identity_email_canonical TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'consumed', 'released', 'expired')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      released_at TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slot_holds_active_slot
    ON booking_slot_holds (slot_id)
    WHERE status = 'active'
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_status_expiry
    ON booking_slot_holds (status, expires_at ASC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_identity
    ON booking_slot_holds (identity_email_canonical, status, created_at DESC)
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_teacher_availability_unique_time
    ON profile_teacher_availability (teacher_id, date, start_time, end_time)
  `,
] as const;
