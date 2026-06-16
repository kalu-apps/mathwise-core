import assert from "node:assert/strict";
import test from "node:test";
import { AccessRepository } from "./access.repository";

test("access repository: entitlement lookup accepts access rows and purchase history", async () => {
  let entitlementQuery = "";
  const repository = new AccessRepository({
    query: async (statement: string) => {
      entitlementQuery = statement;
      return [{ hasActiveEntitlement: true }];
    },
  } as never);

  const hasEntitlement = await repository.hasActiveEntitlement(
    "student_1",
    "course_1"
  );

  assert.equal(hasEntitlement, true);
  assert.match(entitlementQuery, /user_course_access/);
  assert.match(entitlementQuery, /profile_purchases/);
});
