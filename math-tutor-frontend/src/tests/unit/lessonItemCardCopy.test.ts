import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const lessonItemPath = path.resolve(
  process.cwd(),
  "src/entities/lesson/ui/LessonItem.tsx"
);

describe("lesson item card copy", () => {
  it("does not render legacy ready-to-watch subtitle copy", () => {
    const source = fs.readFileSync(lessonItemPath, "utf-8");
    expect(source.includes("Готов к просмотру")).toBe(false);
  });
});
