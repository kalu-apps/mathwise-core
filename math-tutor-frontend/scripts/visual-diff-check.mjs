import fs from "fs";
import path from "path";
import crypto from "crypto";

const root = process.cwd();
const matrixPath = path.join(root, "docs/visual-regression-matrix.json");
const ignorePath = path.join(root, "docs/visual-regression-ignore.json");
const strict = process.env.VISUAL_DIFF_STRICT === "1";

if (!fs.existsSync(matrixPath)) {
  console.error("visual-diff-check: matrix file missing. Run `npm run visual:matrix` first.");
  process.exit(1);
}

const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf-8"));
const scenarios = Array.isArray(matrix.scenarios) ? matrix.scenarios : [];
const ignoreConfig = fs.existsSync(ignorePath)
  ? JSON.parse(fs.readFileSync(ignorePath, "utf-8"))
  : {};
const ignoreChanged = Array.isArray(ignoreConfig.ignoreChanged)
  ? ignoreConfig.ignoreChanged
  : [];

const isIgnored = (scenarioId) =>
  ignoreChanged.some((pattern) => {
    if (pattern === scenarioId) return true;
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return scenarioId.startsWith(prefix);
    }
    return false;
  });

const hashFile = (p) => {
  const buf = fs.readFileSync(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
};

const missing = [];
const changed = [];
const changedIgnored = [];
let presentPairs = 0;

for (const s of scenarios) {
  const baseline = path.join(root, s.baseline);
  const current = path.join(root, s.current);
  const hasBase = fs.existsSync(baseline);
  const hasCurrent = fs.existsSync(current);
  if (!hasBase || !hasCurrent) {
    missing.push({
      id: s.id,
      baseline: hasBase,
      current: hasCurrent,
    });
    continue;
  }
  presentPairs += 1;
  const baseHash = hashFile(baseline);
  const currHash = hashFile(current);
  if (baseHash !== currHash) {
    if (isIgnored(s.id)) {
      changedIgnored.push(s.id);
    } else {
      changed.push(s.id);
    }
  }
}

if (missing.length > 0) {
  const header = strict
    ? "Visual diff failed: missing baseline/current images"
    : "Visual diff warning: missing baseline/current images (non-strict mode)";
  console.log(header);
  for (const m of missing.slice(0, 12)) {
    console.log(`- ${m.id}: baseline=${m.baseline} current=${m.current}`);
  }
  if (strict) process.exit(1);
}

if (changed.length > 0) {
  const header = strict
    ? "Visual diff failed: image changes detected"
    : "Visual diff warning: image changes detected (non-strict mode)";
  console.log(header);
  for (const id of changed.slice(0, 20)) {
    console.log(`- ${id}`);
  }
  if (strict) process.exit(1);
}

if (changedIgnored.length > 0) {
  console.log("Visual diff note: ignored changed scenarios");
  for (const id of changedIgnored.slice(0, 20)) {
    console.log(`- ${id}`);
  }
}

console.log(
  `Visual diff check completed. scenarios=${scenarios.length}, compared=${presentPairs}, changed=${changed.length}, changedIgnored=${changedIgnored.length}, missing=${missing.length}`
);
