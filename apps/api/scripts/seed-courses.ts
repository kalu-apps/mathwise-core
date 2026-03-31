import { Pool } from "pg";
import { getApiRuntimeConfig } from "../src/config/runtime.config";
import {
  readReadSliceSeedData,
  upsertAccessReadModel,
  upsertCourses,
  upsertLessons,
} from "../src/seed/readSlice.seed";
import { hashPassword } from "../src/auth/auth.password";
import { readAuthSeedUsers, upsertAuthUsers } from "../src/auth/auth.seed";

type SeedExecutor = {
  execute: (text: string, params?: unknown[]) => Promise<void>;
};

const ensureCoursesSchema = async (executor: SeedExecutor) => {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS courses_catalog (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '',
      price_guided INTEGER NOT NULL DEFAULT 0,
      price_self INTEGER NOT NULL DEFAULT 0,
      teacher_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const ensureLessonsSchema = async (executor: SeedExecutor) => {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS course_lessons (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      video_url TEXT,
      video_stream_url TEXT,
      video_poster_url TEXT,
      media_job_id TEXT,
      media_job_status TEXT,
      media_job_error TEXT,
      materials_json JSONB,
      settings_json JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await executor.execute(`
    CREATE INDEX IF NOT EXISTS idx_course_lessons_course_order
    ON course_lessons (course_id, sort_order)
  `);
};

const ensureAccessSchema = async (executor: SeedExecutor) => {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS access_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
      is_identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS user_course_access (
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      has_active_entitlement BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, course_id)
    )
  `);
};

const ensureAuthSchema = async (executor: SeedExecutor) => {
  await executor.execute(`
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
};

async function main() {
  const runtimeConfig = getApiRuntimeConfig({ requireRedis: false });
  const pool = new Pool({ connectionString: runtimeConfig.databaseUrl });

  try {
    const executor: SeedExecutor = {
      execute: async (text, params = []) => {
        await pool.query(text, params);
      },
    };

    await ensureCoursesSchema(executor);
    await ensureLessonsSchema(executor);
    await ensureAccessSchema(executor);
    await ensureAuthSchema(executor);

    const seed = readReadSliceSeedData(runtimeConfig.coursesSeedSourceFile);
    const authUsers = readAuthSeedUsers(runtimeConfig.coursesSeedSourceFile).map((user) => ({
      ...user,
      passwordHash: user.password
        ? hashPassword(user.password, runtimeConfig.authPasswordPepper)
        : null,
    }));
    await upsertCourses(executor, seed.courses);
    await upsertLessons(executor, seed.lessons);
    await upsertAccessReadModel(executor, seed.access);
    await upsertAuthUsers(executor, authUsers);

    // eslint-disable-next-line no-console
    console.log(
      `[seed:courses] upserted courses=${seed.courses.length}, lessons=${seed.lessons.length}, accessUsers=${seed.access.users.length}, accessLinks=${seed.access.courseAccess.length}, authUsers=${authUsers.length}`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[seed:courses] failed", error);
  process.exitCode = 1;
});
