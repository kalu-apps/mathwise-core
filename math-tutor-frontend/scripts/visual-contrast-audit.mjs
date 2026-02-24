import fs from "fs";
import path from "path";

const root = process.cwd();
const dsPath = path.join(root, "src/styles/design-system.css");

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (!fs.existsSync(dsPath)) {
  fail("visual-contrast-audit: design-system.css not found");
}

const css = fs.readFileSync(dsPath, "utf-8");

const extractBlock = (source, marker) => {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(open + 1, i);
    }
  }
  return null;
};

const parseTokens = (block) => {
  const map = new Map();
  const re = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(block))) {
    map.set(`--${match[1]}`, match[2].trim());
  }
  return map;
};

const darkBlock = extractBlock(css, ":root,\n:root[data-theme=\"dark\"]");
const lightBlock = extractBlock(css, ":root[data-theme=\"light\"]");

if (!darkBlock || !lightBlock) {
  fail("visual-contrast-audit: theme blocks not found");
}

const dark = parseTokens(darkBlock);
const light = parseTokens(lightBlock);

const parseColor = (value) => {
  const v = value.trim().toLowerCase();
  if (v.startsWith("#")) {
    const raw = v.slice(1);
    if (raw.length === 3) {
      const r = parseInt(raw[0] + raw[0], 16);
      const g = parseInt(raw[1] + raw[1], 16);
      const b = parseInt(raw[2] + raw[2], 16);
      return { r, g, b };
    }
    if (raw.length === 6 || raw.length === 8) {
      const r = parseInt(raw.slice(0, 2), 16);
      const g = parseInt(raw.slice(2, 4), 16);
      const b = parseInt(raw.slice(4, 6), 16);
      return { r, g, b };
    }
    return null;
  }
  const rgb = v.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const nums = rgb[1]
      .split(",")
      .map((x) => x.trim())
      .slice(0, 3)
      .map((n) => Number(n));
    if (nums.every((n) => Number.isFinite(n))) {
      return { r: nums[0], g: nums[1], b: nums[2] };
    }
  }
  return null;
};

const toLinear = (x) => {
  const v = x / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ r, g, b }) => {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

const ratio = (fg, bg) => {
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
};

const checks = [
  { fg: "--text-primary", bg: "--bg-canvas", min: 7.0, name: "primary-on-canvas" },
  { fg: "--text-secondary", bg: "--surface-elevated", min: 4.5, name: "secondary-on-surface" },
  { fg: "--text-muted", bg: "--surface-soft", min: 3.2, name: "muted-on-soft-surface" },
  { fg: "--price-value-color", bg: "--surface-elevated", min: 4.5, name: "price-value" },
  { fg: "--price-title-color", bg: "--surface-elevated", min: 4.0, name: "price-title" },
  { fg: "--cabinet-icon-color", bg: "--surface-elevated", min: 3.2, name: "cabinet-icon" },
  { fg: "--header-counter-text", bg: "--surface-elevated", min: 3.8, name: "header-counter" },
];

const runTheme = (themeName, themeTokens) => {
  const errors = [];
  for (const c of checks) {
    const fgVal = themeTokens.get(c.fg);
    const bgVal = themeTokens.get(c.bg);
    if (!fgVal || !bgVal) {
      errors.push(`${themeName}/${c.name}: token not found (${c.fg}, ${c.bg})`);
      continue;
    }
    const fg = parseColor(fgVal);
    const bg = parseColor(bgVal);
    if (!fg || !bg) {
      errors.push(`${themeName}/${c.name}: non-solid color tokens (${fgVal} / ${bgVal})`);
      continue;
    }
    const r = ratio(fg, bg);
    if (r < c.min) {
      errors.push(`${themeName}/${c.name}: contrast ${r.toFixed(2)} < ${c.min}`);
    }
  }
  return errors;
};

const allErrors = [
  ...runTheme("dark", dark),
  ...runTheme("light", light),
];

if (allErrors.length > 0) {
  console.error("Visual contrast audit failed:");
  for (const e of allErrors) {
    console.error(`- ${e}`);
  }
  process.exit(1);
}

console.log("Visual contrast audit passed.");
