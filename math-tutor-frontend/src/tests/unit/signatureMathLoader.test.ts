import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignatureMathLoader } from "@/shared/ui/loading/SignatureMathLoader";

describe("signature math loader", () => {
  it("renders formula simplification narrative and completion state", () => {
    const markup = renderToStaticMarkup(
      createElement(SignatureMathLoader, { percent: 67 })
    );

    expect(markup).toContain("data-loader=\"signature-math\"");
    expect(markup).toContain("lim");
    expect(markup).toContain("∫₀^π sin x dx");
    expect(markup).toContain("1 + 2");
    expect(markup).toContain("100%");
    expect(markup).toContain("67%");
  });
});

