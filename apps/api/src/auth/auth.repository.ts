import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type { AuthUserDto } from "./auth.types";

type AuthUserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "student" | "teacher";
  phone: string | null;
  photo: string | null;
  passwordHash: string | null;
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
          password_hash AS "passwordHash"
        FROM auth_users
        WHERE email = $1
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
          password_hash AS "passwordHash"
        FROM auth_users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
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
}
