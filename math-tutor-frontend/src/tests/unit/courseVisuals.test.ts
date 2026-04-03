import { describe, expect, it } from "vitest";
import {
  buildCourseVisualLayers,
  deriveCourseVisualMetadata,
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

  it("builds lightweight css layers with encoded mathematical pattern", () => {
    const metadata = deriveCourseVisualMetadata("course_topology_intro");
    const layers = buildCourseVisualLayers(metadata, "card");

    expect(layers.baseGradient).toContain("linear-gradient");
    expect(layers.patternImage).toContain("data:image/svg+xml");
    expect(layers.glowGradient).toContain("radial-gradient");
  });
});
