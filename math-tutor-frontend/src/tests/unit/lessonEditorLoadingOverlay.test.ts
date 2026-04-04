import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("lesson editor saving overlay", () => {
  it("uses analytical loader for lesson save overlay", () => {
    const lessonEditorPath = path.resolve(
      process.cwd(),
      "src/features/course-editor/ui/LessonEditor.tsx"
    );
    const source = fs.readFileSync(lessonEditorPath, "utf-8");

    expect(source.includes("useDelayedLoading(")).toBe(false);
    expect(source.includes("SIGNATURE_VIDEO_SAVE_DELAY_MS")).toBe(false);
    expect(source.includes("<SignatureMathLoader")).toBe(false);
    expect(source.includes("<AnalyticalSurfaceLoader size={modalLoaderSize} />")).toBe(true);
    expect(source.includes("lesson-editor-dialog__save-overlay")).toBe(true);
    expect(source.includes("lesson-editor-dialog__save-progress")).toBe(true);
    expect(source.includes("saveVideoProgressPercent")).toBe(true);
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
