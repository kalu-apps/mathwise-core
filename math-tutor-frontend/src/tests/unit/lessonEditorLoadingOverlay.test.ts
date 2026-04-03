import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("lesson editor saving overlay", () => {
  it("uses brand matrix loader inside modal during saving", () => {
    const lessonEditorPath = path.resolve(
      process.cwd(),
      "src/features/course-editor/ui/LessonEditor.tsx"
    );
    const source = fs.readFileSync(lessonEditorPath, "utf-8");

    expect(source.includes("<BrandLoader size={modalLoaderSize} />")).toBe(true);
    expect(source.includes("lesson-editor-dialog__save-overlay")).toBe(true);
    expect(source.includes("saveStatusText")).toBe(true);
  });

  it("keeps CTA spinner path for save action", () => {
    const lessonEditorPath = path.resolve(
      process.cwd(),
      "src/features/course-editor/ui/LessonEditor.tsx"
    );
    const source = fs.readFileSync(lessonEditorPath, "utf-8");

    expect(source.includes("<ButtonPending loading={isSaving}")).toBe(true);
  });
});
