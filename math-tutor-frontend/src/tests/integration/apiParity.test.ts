import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readFile = (absolutePath: string) =>
  fs.readFileSync(absolutePath, "utf-8");

const collectSourceFiles = (root: string): string[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "tests") continue;
        walk(absolutePath);
        continue;
      }
      if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  };
  walk(root);
  return files;
};

describe("api parity", () => {
  it("does not keep legacy /users, /teacher-profiles, /support endpoints in active frontend runtime APIs", () => {
    const files = collectSourceFiles(path.resolve(process.cwd(), "src"));
    const forbidden = ["/users/", "/teacher-profiles/", "/support/"];

    for (const file of files) {
      const source = readFile(file);
      for (const endpoint of forbidden) {
        expect(source.includes(endpoint)).toBe(false);
      }
    }
  });
});
