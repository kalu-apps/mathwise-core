import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveCourseVisualMetadata,
  resolveCourseVisualMetadata,
} from "./courses.visuals";

test("course visuals: deterministic metadata from course id", () => {
  const first = deriveCourseVisualMetadata("course_algebra_101");
  const second = deriveCourseVisualMetadata("course_algebra_101");

  assert.deepEqual(second, first);
  assert.equal(typeof first.visualSeed, "number");
  assert.ok(first.visualSeed >= 0);
  assert.ok(first.visualSeed <= 2_147_483_647);
});

test("course visuals: fallback for invalid metadata", () => {
  const resolved = resolveCourseVisualMetadata("course_geometry", {
    visualStyle: "unknown",
    visualPalette: "wrong",
    visualSeed: -99,
    visualVariant: 999,
  });

  const fallback = deriveCourseVisualMetadata("course_geometry");
  assert.equal(resolved.visualStyle, fallback.visualStyle);
  assert.equal(resolved.visualPalette, fallback.visualPalette);
  assert.equal(resolved.visualSeed, 0);
  assert.equal(resolved.visualVariant, 255);
});

test("course visuals: accepts explicit valid metadata", () => {
  const resolved = resolveCourseVisualMetadata("course_topology", {
    visualStyle: "topology",
    visualPalette: "violet-mint",
    visualSeed: 334455,
    visualVariant: 4,
  });

  assert.deepEqual(resolved, {
    visualStyle: "topology",
    visualPalette: "violet-mint",
    visualSeed: 334455,
    visualVariant: 4,
  });
});

test("course visuals: maps legacy lattice to projection-wireframe", () => {
  const resolved = resolveCourseVisualMetadata("course_legacy", {
    visualStyle: "lattice",
    visualPalette: "graphite-aurora",
    visualSeed: 1010,
    visualVariant: 7,
  });

  assert.equal(resolved.visualStyle, "projection-wireframe");
});

test("course visuals: clamps explicit oversized seed to int4-safe max", () => {
  const resolved = resolveCourseVisualMetadata("course_seed_clamp", {
    visualSeed: 4_000_000_000,
  });

  assert.equal(resolved.visualSeed, 2_147_483_647);
});
