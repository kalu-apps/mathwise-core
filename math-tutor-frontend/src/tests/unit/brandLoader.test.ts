import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLoader } from "@/shared/ui/loading/BrandLoader";

describe("brand loader", () => {
  it("renders geometric matrix cells with default size variant", () => {
    const markup = renderToStaticMarkup(createElement(BrandLoader));

    expect(markup).toContain("data-loader=\"brand-matrix\"");
    expect(markup).toContain("ui-loader-brand--md");
    expect(markup.match(/data-brand-cell=/g)?.length).toBe(10);
  });

  it("supports size variants and visibility state", () => {
    const markup = renderToStaticMarkup(
      createElement(BrandLoader, { size: "sm", visible: false })
    );

    expect(markup).toContain("ui-loader-brand--sm");
    expect(markup).not.toContain("is-visible");
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

    expect(pageSource.includes("<BrandLoader size=\"lg\" visible={showRing} />")).toBe(
      true
    );
    expect(sectionSource.includes("<BrandLoader size=\"sm\" className=\"ui-loader__inline-brand\" />")).toBe(true);
  });
});
