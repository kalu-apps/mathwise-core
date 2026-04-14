import assert from "node:assert/strict";
import test from "node:test";
import { BOOKINGS_SCHEMA_STATEMENTS } from "../bookings/bookings.schema";
import { CapabilitiesService } from "../capabilities/capabilities.service";
import { ProfileRepository } from "../profile/profile.repository";
import { PURCHASES_SCHEMA_STATEMENTS } from "../purchases/purchases.schema";

test("schema ownership: access_capability_grants is owned by capabilities module", async () => {
  assert.equal(
    PURCHASES_SCHEMA_STATEMENTS.some((statement) =>
      statement.includes("access_capability_grants")
    ),
    false
  );

  const executed: string[] = [];
  const service = new CapabilitiesService({
    execute: async (text: string) => {
      executed.push(text);
    },
    query: async () => [],
  } as never);
  await service.onModuleInit();

  assert.equal(
    executed.some((statement) =>
      statement.includes("CREATE TABLE IF NOT EXISTS access_capability_grants")
    ),
    true
  );
});

test("schema ownership: bookings owns booking tables and shared idempotency is not duplicated there", () => {
  assert.equal(
    BOOKINGS_SCHEMA_STATEMENTS.some((statement) =>
      statement.includes("CREATE TABLE IF NOT EXISTS profile_bookings")
    ),
    true
  );
  assert.equal(
    BOOKINGS_SCHEMA_STATEMENTS.some((statement) =>
      statement.includes("CREATE TABLE IF NOT EXISTS profile_teacher_availability")
    ),
    true
  );
  assert.equal(
    BOOKINGS_SCHEMA_STATEMENTS.some((statement) =>
      statement.includes("CREATE TABLE IF NOT EXISTS booking_slot_holds")
    ),
    true
  );
  assert.equal(
    BOOKINGS_SCHEMA_STATEMENTS.some((statement) =>
      statement.includes("CREATE TABLE IF NOT EXISTS write_idempotency_records")
    ),
    false
  );
  assert.equal(
    PURCHASES_SCHEMA_STATEMENTS.some((statement) =>
      statement.includes("CREATE TABLE IF NOT EXISTS write_idempotency_records")
    ),
    true
  );
});

test("schema ownership: profile repository does not own bookings ddl", async () => {
  const executed: string[] = [];
  const repository = new ProfileRepository({
    execute: async (text: string) => {
      executed.push(text);
    },
    query: async () => [],
  } as never);

  await repository.ensureSchema();
  const executedSql = executed.join("\n");

  assert.equal(
    executedSql.includes("CREATE TABLE IF NOT EXISTS profile_bookings"),
    false
  );
  assert.equal(
    executedSql.includes("CREATE TABLE IF NOT EXISTS profile_teacher_availability"),
    false
  );
  assert.equal(
    executedSql.includes("CREATE TABLE IF NOT EXISTS profile_teacher_invites"),
    true
  );
});

test("schema ownership: profile bootstrap tolerates bookings tables absent", async () => {
  const repository = new ProfileRepository({
    execute: async () => undefined,
    query: async (text: string) => {
      if (text.includes("FROM profile_purchases")) {
        return [{ count: "0" }];
      }
      if (text.includes("FROM profile_bookings")) {
        const error = new Error("relation does not exist") as Error & {
          code?: string;
        };
        error.code = "42P01";
        throw error;
      }
      if (text.includes("FROM profile_teacher_availability")) {
        const error = new Error("relation does not exist") as Error & {
          code?: string;
        };
        error.code = "42P01";
        throw error;
      }
      return [{ count: "0" }];
    },
  } as never);

  const hasAny = await repository.hasAnyProfileData();
  assert.equal(hasAny, false);
});
