import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), "src", relativePath), "utf-8");

test("route parity: news controller exposes api/news contract", () => {
  const source = read("news/news.controller.ts");
  assert.equal(source.includes('@Controller("api/news")'), true);
  assert.equal(source.includes("@Get()"), true);
  assert.equal(source.includes("@Post()"), true);
});

test("route parity: telemetry controller exposes api/telemetry/rum contract", () => {
  const source = read("telemetry/telemetry.controller.ts");
  assert.equal(source.includes('@Controller("api/telemetry")'), true);
  assert.equal(source.includes('@Post("rum")'), true);
});
