import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const lessonDetailsPath = path.resolve(
  process.cwd(),
  "src/pages/lessons/LessonDetails.tsx"
);

describe("lesson runtime layout", () => {
  it("keeps lesson title in hero and renders duration badge above video section", () => {
    const source = fs.readFileSync(lessonDetailsPath, "utf-8");

    expect(source.includes('className="lesson-details__hero"')).toBe(true);
    expect(
      source.includes('<h1 className="lesson-details__title">{lesson.title}</h1>')
    ).toBe(true);
    expect(source.includes('className="lesson-details__video-meta"')).toBe(true);
    expect(source.includes('className="lesson-details__duration-chip"')).toBe(true);
  });

  it("does not render old runtime content badge copy", () => {
    const source = fs.readFileSync(lessonDetailsPath, "utf-8");

    expect(source.includes("Содержание урока")).toBe(false);
  });
});
