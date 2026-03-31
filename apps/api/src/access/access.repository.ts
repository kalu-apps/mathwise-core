import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";

type AccessUserRow = {
  id: string;
  role: "student" | "teacher";
  isIdentityVerified: boolean;
};

@Injectable()
export class AccessRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
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
  }

  async hasAnyUsers(): Promise<boolean> {
    const rows = await this.databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM access_users"
    );
    return Number(rows[0]?.count ?? 0) > 0;
  }

  async findUserContext(userId: string): Promise<AccessUserRow | null> {
    const rows = await this.databaseService.query<AccessUserRow>(
      `
        SELECT
          id,
          role,
          is_identity_verified AS "isIdentityVerified"
        FROM access_users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );
    return rows[0] ?? null;
  }

  async hasActiveEntitlement(userId: string, courseId: string): Promise<boolean> {
    const rows = await this.databaseService.query<{ hasActiveEntitlement: boolean }>(
      `
        SELECT has_active_entitlement AS "hasActiveEntitlement"
        FROM user_course_access
        WHERE user_id = $1 AND course_id = $2
        LIMIT 1
      `,
      [userId, courseId]
    );
    return Boolean(rows[0]?.hasActiveEntitlement);
  }
}
