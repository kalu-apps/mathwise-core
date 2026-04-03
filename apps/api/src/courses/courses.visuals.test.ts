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
