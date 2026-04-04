import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticalSurfaceLoader } from "@/shared/ui/loading/AnalyticalSurfaceLoader";

describe("analytical surface loader", () => {
  it("renders cosmic sine + hyperbola analytical scene with default size variant", () => {
    const markup = renderToStaticMarkup(createElement(AnalyticalSurfaceLoader));

    expect(markup).toContain("data-loader=\"analytical-surface\"");
    expect(markup).toContain("ui-loader-analytical--md");
    expect(markup).toContain("ui-loader-analytical__sine-progress");
    expect(markup).toContain("ui-loader-analytical__hyperbola-accent");
    expect(markup).toContain("ui-loader-analytical__axis--x");
  });

  it("supports size variants and visibility state", () => {
    const markup = renderToStaticMarkup(
      createElement(AnalyticalSurfaceLoader, { size: "sm", visible: false })
    );

    expect(markup).toContain("ui-loader-analytical--sm");
    expect(markup).not.toContain("is-visible");
  });

  it("maps explicit progress to sine drawing length", () => {
    const markup = renderToStaticMarkup(
      createElement(AnalyticalSurfaceLoader, { progress: 63 })
    );

    expect(markup).toContain("stroke-dasharray=\"63 100\"");
  });

  it("is used by shared page and section loading components", () => {
    const pageLoaderPath = path.resolve(
      process.cwd(),
      "src/shared/ui/loading/PageLoader.tsx"
    );
    const sectionLoaderPath = path.resolve(
      process.cwd(),
      "src/shared/ui/loading/SectionLoader.tsx"
    );

    const pageSource = fs.readFileSync(pageLoaderPath, "utf-8");
    const sectionSource = fs.readFileSync(sectionLoaderPath, "utf-8");

    expect(pageSource.includes("loaderSize = \"lg\"")).toBe(true);
    expect(
      pageSource.includes("<AnalyticalSurfaceLoader size={loaderSize} visible={showRing} />")
    ).toBe(true);
    expect(
      sectionSource.includes(
        "<AnalyticalSurfaceLoader size=\"sm\" className=\"ui-loader__inline-analytical\" />"
      )
    ).toBe(true);
  });
});
