import { describe, expect, it } from "vitest";
import {
  buildCourseVisualLayers,
  deriveCourseVisualMetadata,
  getCourseVisualFamilyLabel,
  resolveCourseVisualMetadata,
} from "@/entities/course/model/courseVisuals";

describe("course visual system", () => {
  it("derives deterministic metadata for the same course id", () => {
    const first = deriveCourseVisualMetadata("course_linear_algebra");
    const second = deriveCourseVisualMetadata("course_linear_algebra");

    expect(second).toEqual(first);
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
});
