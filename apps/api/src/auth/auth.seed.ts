import fs from "node:fs";
import type { AuthUserRole } from "./auth.types";

type RawSourcePayload = {
  users?: unknown;
};

type AuthSeedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AuthUserRole;
  password?: string;
};

type SeedExecutor = {
  execute: (text: string, params?: unknown[]) => Promise<void>;
};

const normalizeRole = (value: unknown): AuthUserRole | null => {
  return value === "student" || value === "teacher" ? value : null;
};

const normalizeOptionalString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

export const readAuthSeedUsers = (sourceFile: string): AuthSeedUser[] => {
  if (!fs.existsSync(sourceFile)) return [];
  try {
    const raw = fs.readFileSync(sourceFile, "utf-8");
    const parsed = JSON.parse(raw) as RawSourcePayload;
    if (!Array.isArray(parsed.users)) return [];

    const mapped = parsed.users.map((entry): AuthSeedUser | null => {
        if (!entry || typeof entry !== "object") return null;
        const rawUser = entry as Record<string, unknown>;
        const id = normalizeOptionalString(rawUser.id);
        const email = normalizeOptionalString(rawUser.email).toLowerCase();
        const role = normalizeRole(rawUser.role);
        if (!id || !email || !role) return null;
        const firstName = normalizeOptionalString(rawUser.firstName);
        const lastName = normalizeOptionalString(rawUser.lastName);
        const password = normalizeOptionalString(rawUser.password);
        return {
          id,
          email,
          firstName,
          lastName,
          role,
          password: password || undefined,
        };
      });

    return mapped.filter((user): user is AuthSeedUser => user !== null);
  } catch {
    return [];
  }
};

export const upsertAuthUsers = async (
  executor: SeedExecutor,
  users: Array<
    AuthSeedUser & {
      passwordHash?: string | null;
    }
  >
) => {
  for (const user of users) {
    await executor.execute(
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
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          email = EXCLUDED.email,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          role = EXCLUDED.role,
          password_hash = COALESCE(EXCLUDED.password_hash, auth_users.password_hash),
          updated_at = NOW()
      `,
      [
        user.id,
        user.email,
        user.firstName,
        user.lastName,
        user.role,
        user.passwordHash ?? null,
      ]
    );
  }
};
