import { Pool } from "pg";
import { getApiRuntimeConfig } from "../src/config/runtime.config";
import { readCourseSeedItems, upsertCourses } from "../src/courses/courses.seed";

async function run() {
  const runtimeConfig = getApiRuntimeConfig({ requireRedis: false });
  const pool = new Pool({
    connectionString: runtimeConfig.databaseUrl,
  });

  try {
    await pool.query(`
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

    const seedItems = readCourseSeedItems(runtimeConfig.coursesSeedSourceFile);
    await upsertCourses(
      {
        execute: async (text, params = []) => {
          await pool.query(text, params);
        },
      },
      seedItems
    );

    // eslint-disable-next-line no-console
    console.log(`[seed:courses] Upserted ${seedItems.length} courses`);
  } finally {
    await pool.end();
  }
}

void run();
