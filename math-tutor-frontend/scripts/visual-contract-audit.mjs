import fs from "fs";
import path from "path";

const root = process.cwd();

const read = (p) => fs.readFileSync(path.join(root, p), "utf-8");

const contracts = [
  {
    file: "src/styles/visual/migrated/course-details.scss",
    checks: [
      { type: "contains", value: ".course-details__lessons-head" },
      { type: "contains", value: "flex-wrap: wrap;" },
      { type: "contains", value: ".course-details__lessons-total" },
      { type: "contains", value: "var(--header-counter-bg)" },
      { type: "contains", value: "&-price" },
      { type: "contains", value: "var(--price-value-color)" },
      { type: "contains", value: "&-header" },
      { type: "contains", value: "var(--price-title-color)" },
    ],
  },
  {
    file: "src/styles/visual/migrated/study-cabinet.scss",
    checks: [
      { type: "contains", value: ".study-cabinet-panel__icon" },
      { type: "contains", value: "var(--cabinet-icon-color)" },
      { type: "contains", value: "var(--cabinet-icon-bg)" },
    ],
  },
  {
    file: "src/styles/visual/_core.scss",
    checks: [
      { type: "contains", value: "[class*=\"status\"]" },
      { type: "contains", value: ".MuiDialog-root .MuiDialog-paper" },
      { type: "contains", value: "[class*=\"__empty\"]" },
      { type: "contains", value: "[class*=\"loading\"]" },
    ],
  },
];

const issues = [];

for (const contract of contracts) {
  const abs = path.join(root, contract.file);
  if (!fs.existsSync(abs)) {
    issues.push(`Missing file: ${contract.file}`);
    continue;
  }
  const content = read(contract.file);
  for (const check of contract.checks) {
    if (check.type === "contains" && !content.includes(check.value)) {
      issues.push(`${contract.file}: missing "${check.value}"`);
    }
  }
}

if (issues.length > 0) {
  console.error("Visual contract audit failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Visual contract audit passed.");
