import { describe, expect, it } from "vitest";
import {
  buildCourseVisualLayers,
  COURSE_VISUAL_STYLES,
  deriveCourseVisualMetadata,
  getCourseVisualFamilyLabel,
  resolveCourseVisualMetadata,
} from "@/entities/course/model/courseVisuals";

describe("course visual system", () => {
  it("keeps canonical style order aligned with backend release metadata", () => {
    expect(COURSE_VISUAL_STYLES).toEqual([
      "polyhedra",
      "function-fields",
      "projection-wireframe",
      "topology",
      "analytic-sections",
      "signal-waves",
    ]);
  });

  it("derives deterministic metadata for the same course id", () => {
    const first = deriveCourseVisualMetadata("course_linear_algebra");
    const second = deriveCourseVisualMetadata("course_linear_algebra");

    expect(second).toEqual(first);
    expect(first.visualSeed).toBeGreaterThanOrEqual(0);
    expect(first.visualSeed).toBeLessThanOrEqual(2_147_483_647);
  });

  it("respects explicit metadata when it is valid", () => {
    const resolved = resolveCourseVisualMetadata({
      id: "course_graphs",
      visualStyle: "function-fields",
      visualPalette: "cobalt-cyan",
      visualSeed: 123456,
      visualVariant: 2,
    });

    expect(resolved).toEqual({
      visualStyle: "function-fields",
      visualPalette: "cobalt-cyan",
      visualSeed: 123456,
      visualVariant: 2,
    });
  });

  it("builds static pre-rendered scene layers for card mode", () => {
    const metadata = deriveCourseVisualMetadata("course_topology_intro");
    const layers = buildCourseVisualLayers(metadata, "card");

    expect(layers.baseGradient).toContain("linear-gradient");
    expect(layers.patternImage).toContain("url(");
    expect(layers.patternImage).toMatch(/\.svg|data:image\/svg\+xml/);
    expect(layers.glowGradient).toContain("radial-gradient");
    expect(layers.veilGradient).toContain("linear-gradient");
  });

  it("maps legacy lattice style to projection wireframe family", () => {
    const resolved = resolveCourseVisualMetadata({
      id: "course_legacy_lattice",
      visualStyle: "lattice",
      visualPalette: "graphite-aurora",
      visualSeed: 7777,
      visualVariant: 3,
    });

    expect(resolved.visualStyle).toBe("projection-wireframe");
    expect(getCourseVisualFamilyLabel(resolved.visualStyle)).toBe(
      "Projection Wireframe Space"
    );
  });

  it("keeps scene asset selection deterministic for the same metadata", () => {
    const metadata = resolveCourseVisualMetadata({
      id: "course_signal",
      visualStyle: "signal-waves",
      visualPalette: "indigo-mineral",
      visualSeed: 9090,
      visualVariant: 4,
    });

    const first = buildCourseVisualLayers(metadata, "featured");
    const second = buildCourseVisualLayers(metadata, "featured");

    expect(first.patternImage).toEqual(second.patternImage);
  });

  it("clamps oversized explicit seed to int4-safe max", () => {
    const resolved = resolveCourseVisualMetadata({
      id: "course_massive_seed",
      visualSeed: 9_999_999_999,
    });

    expect(resolved.visualSeed).toBe(2_147_483_647);
  });
});
