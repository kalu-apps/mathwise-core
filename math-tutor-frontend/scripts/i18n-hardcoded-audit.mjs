import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const srcDir = path.join(rootDir, "src");
const reportDir = path.join(rootDir, "reports");
const reportPath = path.join(reportDir, "i18n-hardcoded-report.md");
const strictMode = process.argv.includes("--strict");

const includeExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".scss",
  ".css",
]);

const excludedDirectories = [
  path.join(srcDir, "shared", "i18n"),
  path.join(srcDir, "mock"),
];

const hasCyrillic = (line) => /[А-Яа-яЁё]/.test(line);

const isInsideExcludedDirectory = (filePath) =>
  excludedDirectories.some((excludedDir) => {
    const relative = path.relative(excludedDir, filePath);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });

const walk = (dirPath, acc) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(nextPath, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!includeExtensions.has(path.extname(entry.name))) continue;
    if (isInsideExcludedDirectory(nextPath)) continue;
    acc.push(nextPath);
  }
};

const files = [];
walk(srcDir, files);

const findings = [];

for (const filePath of files) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/u);
  const lineNumbers = [];
  lines.forEach((line, index) => {
    if (hasCyrillic(line)) {
      lineNumbers.push(index + 1);
    }
  });
  if (lineNumbers.length > 0) {
    findings.push({
      filePath,
      relativePath: path.relative(rootDir, filePath),
      count: lineNumbers.length,
      lines: lineNumbers,
    });
  }
}

findings.sort((left, right) => right.count - left.count);

const totalFindings = findings.reduce((sum, item) => sum + item.count, 0);

const markdownRows = findings
  .slice(0, 200)
  .map(
    (item) =>
      `| \`${item.relativePath}\` | ${item.count} | ${item.lines.slice(0, 12).join(", ")}${
        item.lines.length > 12 ? ", ..." : ""
      } |`
  );

const markdown = [
  "# i18n hardcoded audit",
  "",
  `- Generated: ${new Date().toISOString()}`,
  `- Files with hardcoded Cyrillic outside bundles: **${findings.length}**`,
  `- Total line hits: **${totalFindings}**`,
  `- Mode: ${strictMode ? "strict" : "report"}`,
  "",
  "| File | Hits | Line numbers |",
  "| --- | ---: | --- |",
  ...markdownRows,
  "",
].join("\n");

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, markdown, "utf8");

console.log(markdown);
console.log(`\nReport written to: ${path.relative(rootDir, reportPath)}`);

if (strictMode && findings.length > 0) {
  process.exitCode = 1;
}

