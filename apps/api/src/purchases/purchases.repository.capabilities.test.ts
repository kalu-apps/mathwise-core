import assert from "node:assert/strict";
import test from "node:test";
import { PurchasesRepository } from "./purchases.repository";

const createRepositoryHarness = () => {
  const grants = new Map<
    string,
    {
      userId: string;
      capability: string;
      sourceKind: string;
      sourceRef: string;
      courseId: string;
      teacherId: string;
      state: string;
    }
  >();

  const tx = {
    execute: async (sql: string, params: unknown[] = []) => {
      if (!sql.includes("INSERT INTO access_capability_grants")) {
        return;
      }
      const userId = String(params[1] ?? "");
      const capability = String(params[2] ?? "");
      const sourceKind = String(params[3] ?? "");
      const sourceRef = String(params[4] ?? "");
      const courseId = String(params[5] ?? "");
      const teacherId = String(params[6] ?? "");
      const state = String(params[7] ?? "");
      const key = `${userId}|${capability}|${sourceKind}|${sourceRef}|${courseId}|${teacherId}`;
      grants.set(key, {
        userId,
        capability,
        sourceKind,
        sourceRef,
        courseId,
        teacherId,
        state,
      });
    },
    query: async () => [],
  };

  const databaseService = {
    execute: async () => undefined,
    query: async () => [],
    transaction: async <T>(callback: (executor: typeof tx) => Promise<T>) =>
      callback(tx),
  };

  return {
    repository: new PurchasesRepository(databaseService as never),
    grants,
  };
};

test("capability grants: standard purchase issues only course_access", async () => {
  const { repository, grants } = createRepositoryHarness();

  await repository.upsertCapabilityGrantsForPurchase({
    userId: "student_1",
    purchaseId: "purchase_1",
    courseId: "course_1",
    tariff: "standard",
    teacherId: "teacher_1",
    grantedAt: "2026-04-14T00:00:00.000Z",
  });

  assert.equal(grants.size, 1);
  assert.equal(
    Array.from(grants.values()).map((item) => item.capability)[0],
    "course_access"
  );
});

test("capability grants: premium purchase issues course + chat + whiteboard", async () => {
  const { repository, grants } = createRepositoryHarness();

  await repository.upsertCapabilityGrantsForPurchase({
    userId: "student_2",
    purchaseId: "purchase_2",
    courseId: "course_2",
    tariff: "premium",
    teacherId: "teacher_2",
    grantedAt: "2026-04-14T00:00:00.000Z",
  });

  assert.equal(grants.size, 3);
  const capabilities = Array.from(grants.values())
    .map((item) => item.capability)
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(capabilities, [
    "course_access",
    "teacher_chat_access",
    "whiteboard_access",
  ]);
});

test("capability grants: repeated premium finalization stays idempotent", async () => {
  const { repository, grants } = createRepositoryHarness();

  const payload = {
    userId: "student_3",
    purchaseId: "purchase_3",
    courseId: "course_3",
    tariff: "premium" as const,
    teacherId: "teacher_3",
    grantedAt: "2026-04-14T00:00:00.000Z",
  };

  await repository.upsertCapabilityGrantsForPurchase(payload);
  await repository.upsertCapabilityGrantsForPurchase(payload);

  assert.equal(grants.size, 3);
  const uniqueKeys = Array.from(grants.keys());
  assert.equal(
    uniqueKeys.every((key) => key.includes("purchase_3")),
    true
  );
});
