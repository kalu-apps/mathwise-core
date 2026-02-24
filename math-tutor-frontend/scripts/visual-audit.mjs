import fs from "fs";
import path from "path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const stylesRoot = path.join(srcDir, "styles");
const MAX_MIGRATED_HARDCODED_COLORS = 160;
const MAX_TSX_INLINE_STYLE_CALLS = 20;

const issues = [];
let metrics = {
  inlineStyleCalls: 0,
  hardcodedInMigrated: 0,
};

const walk = (dir, out = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
};

const allFiles = walk(root);
const sourceFiles = allFiles.filter((file) =>
  /\.(ts|tsx|js|jsx|css|scss|json|md)$/i.test(file)
);

const rel = (file) => path.relative(root, file).replace(/\\/g, "/");

const read = (file) => fs.readFileSync(file, "utf-8");

const styleImportAllowed = new Map([
  ["src/main.tsx", new Set(["design-system.css", "visual-refactor-overrides.scss"])],
]);

for (const file of sourceFiles) {
  const r = rel(file);
  const content = read(file);

  const hasTailwind = /@tailwind\b|tailwindcss\b|@tailwindcss\/postcss\b/.test(content);
  if (hasTailwind) {
    issues.push(`${r}: forbidden tailwind marker found`);
  }

  if (/\.(ts|tsx)$/.test(file)) {
    const importMatches = [...content.matchAll(/import\s+["']@\/styles\/([^"']+)["'];/g)];
    for (const match of importMatches) {
      const imported = match[1];
      const allowed = styleImportAllowed.get(r);
      if (!allowed || !allowed.has(imported)) {
        issues.push(`${r}: local style import is not allowed -> @/styles/${imported}`);
      }
    }

    if (!r.endsWith("src/app/theme/muiTheme.ts")) {
      const hardcodedColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(content);
      if (hardcodedColor) {
        issues.push(`${r}: hardcoded color literal detected in TS/TSX`);
      }
    }
  }
}

const tsxFiles = walk(srcDir).filter((file) => file.endsWith(".tsx"));
let inlineStyleCalls = 0;
for (const file of tsxFiles) {
  const content = read(file);
  const sxCalls = content.match(/sx=\{\{/g);
  const styleCalls = content.match(/style=\{\{/g);
  inlineStyleCalls += (sxCalls ? sxCalls.length : 0) + (styleCalls ? styleCalls.length : 0);
}
if (inlineStyleCalls > MAX_TSX_INLINE_STYLE_CALLS) {
  issues.push(
    `TSX inline style debt increased (${inlineStyleCalls} > ${MAX_TSX_INLINE_STYLE_CALLS})`
  );
}
metrics.inlineStyleCalls = inlineStyleCalls;

if (!fs.existsSync(stylesRoot)) {
  issues.push("src/styles: folder missing");
} else {
  const rootEntries = fs.readdirSync(stylesRoot, { withFileTypes: true });
  const files = rootEntries.filter((e) => e.isFile()).map((e) => e.name).sort();
  const dirs = rootEntries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  const expectedFiles = ["design-system.css", "visual-refactor-overrides.scss"];
  const expectedDirs = ["visual"];

  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
    issues.push(
      `src/styles: root files mismatch. expected ${expectedFiles.join(", ")} got ${files.join(", ")}`
    );
  }

  if (JSON.stringify(dirs) !== JSON.stringify(expectedDirs)) {
    issues.push(
      `src/styles: root dirs mismatch. expected ${expectedDirs.join(", ")} got ${dirs.join(", ")}`
    );
  }

  const visualDir = path.join(stylesRoot, "visual");
  const visualEntry = path.join(stylesRoot, "visual-refactor-overrides.scss");
  if (fs.existsSync(visualEntry)) {
    const lines = read(visualEntry)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const hasNonImportRule = lines.some(
      (line) => !line.startsWith("@use \"./visual/") && !line.startsWith("/*")
    );
    if (hasNonImportRule) {
      issues.push("src/styles/visual-refactor-overrides.scss: only @use imports are allowed");
    }
  }

  const core = path.join(visualDir, "_core.scss");
  if (!fs.existsSync(core)) {
    issues.push("src/styles/visual/_core.scss: missing");
  }

  const migratedDir = path.join(visualDir, "migrated");
  if (!fs.existsSync(migratedDir)) {
    issues.push("src/styles/visual/migrated: missing");
  } else {
    const migratedFiles = fs
      .readdirSync(migratedDir)
      .filter((name) => name.endsWith(".scss"))
      .sort();

    if (migratedFiles.length === 0) {
      issues.push("src/styles/visual/migrated: empty");
    }

    let hardcodedInMigrated = 0;
    for (const fileName of migratedFiles) {
      const content = read(path.join(migratedDir, fileName));
      const matches = content.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g);
      hardcodedInMigrated += matches ? matches.length : 0;
    }
    if (hardcodedInMigrated > MAX_MIGRATED_HARDCODED_COLORS) {
      issues.push(
        `src/styles/visual/migrated: hardcoded color debt increased (${hardcodedInMigrated} > ${MAX_MIGRATED_HARDCODED_COLORS})`
      );
    }
    metrics.hardcodedInMigrated = hardcodedInMigrated;
  }
}

if (issues.length > 0) {
  console.error("Visual audit failed:\n");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Visual audit passed.");
console.log(
  `Metrics: inlineStyles=${metrics.inlineStyleCalls}/${MAX_TSX_INLINE_STYLE_CALLS}, hardcodedMigratedColors=${metrics.hardcodedInMigrated}/${MAX_MIGRATED_HARDCODED_COLORS}`
);
