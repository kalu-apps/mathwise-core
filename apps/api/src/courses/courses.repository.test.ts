import assert from "node:assert/strict";
import test from "node:test";
import { CoursesRepository } from "./courses.repository";

test("courses repository: teacher delete soft-hides the course without deleting releases", async () => {
  const executed: string[] = [];
  const repository = new CoursesRepository({
    execute: async (statement: string) => {
      executed.push(statement);
    },
    query: async () => [],
  } as never);

  await repository.deleteDraft("course_1");

  assert.equal(executed.length, 1);
  assert.match(executed[0], /UPDATE courses_catalog/);
  assert.match(executed[0], /teacher_deleted_at/);
  assert.doesNotMatch(executed[0], /DELETE FROM/i);
  assert.doesNotMatch(executed[0], /course_releases/i);
  assert.doesNotMatch(executed[0], /course_release_pointer/i);
});

test("courses repository: teacher workspace and public catalog ignore hidden courses", async () => {
  const queries: string[] = [];
  const repository = new CoursesRepository({
    execute: async () => undefined,
    query: async (statement: string) => {
      queries.push(statement);
      return [];
    },
  } as never);

  await repository.findAllDraftsByTeacher("teacher_1");
  await repository.findAllPublishedCatalog();

  assert.match(queries[0], /teacher_deleted_at IS NULL/);
  assert.match(queries[1], /JOIN courses_catalog/);
  assert.match(queries[1], /teacher_deleted_at IS NULL/);
});
