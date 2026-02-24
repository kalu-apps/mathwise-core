import fs from "fs";
import path from "path";

const root = process.cwd();

const budgets = {
  maxBackdropBlurDecls: 24,
  maxFilterBlurDecls: 30,
  maxBlurPx: 16,
  maxDistCssKb: 180,
  maxDistSingleImageMb: 2.8,
  maxDistImagesTotalMb: 4.5,
};

const walk = (dir, files = []) => {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
};

const styleFiles = walk(path.join(root, "src/styles")).filter((file) =>
  /\.(scss|css)$/.test(file)
);

let backdropBlurDecls = 0;
let filterBlurDecls = 0;
let blurValues = [];

for (const file of styleFiles) {
  const source = fs.readFileSync(file, "utf-8");
  backdropBlurDecls += (source.match(/backdrop-filter\s*:\s*blur\(/g) || []).length;
  filterBlurDecls += (source.match(/filter\s*:\s*blur\(/g) || []).length;
  for (const match of source.matchAll(/blur\((\d+(?:\.\d+)?)px\)/g)) {
    blurValues.push(Number(match[1]));
  }
}

const maxBlurPx = blurValues.length > 0 ? Math.max(...blurValues) : 0;

const distAssetsDir = path.join(root, "dist/assets");
const distAssets = walk(distAssetsDir);
const distCssFiles = distAssets.filter((f) => f.endsWith(".css"));
const distImageFiles = distAssets.filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f));

const cssBytes = distCssFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const cssKb = cssBytes / 1024;

const imageSizes = distImageFiles.map((file) => ({
  file: path.relative(root, file),
  bytes: fs.statSync(file).size,
}));
const maxImageBytes = imageSizes.length
  ? Math.max(...imageSizes.map((item) => item.bytes))
  : 0;
const totalImageBytes = imageSizes.reduce((sum, item) => sum + item.bytes, 0);

const maxImageMb = maxImageBytes / (1024 * 1024);
const totalImageMb = totalImageBytes / (1024 * 1024);

const errors = [];

if (backdropBlurDecls > budgets.maxBackdropBlurDecls) {
  errors.push(
    `backdrop-filter: blur() declarations ${backdropBlurDecls} exceed budget ${budgets.maxBackdropBlurDecls}`
  );
}

if (filterBlurDecls > budgets.maxFilterBlurDecls) {
  errors.push(
    `filter: blur() declarations ${filterBlurDecls} exceed budget ${budgets.maxFilterBlurDecls}`
  );
}

if (maxBlurPx > budgets.maxBlurPx) {
  errors.push(`max blur(${maxBlurPx}px) exceeds budget ${budgets.maxBlurPx}px`);
}

if (!fs.existsSync(distAssetsDir)) {
  errors.push("dist/assets is missing. Run `npm run build` before visual performance audit.");
} else {
  if (cssKb > budgets.maxDistCssKb) {
    errors.push(`dist css size ${cssKb.toFixed(2)}KB exceeds budget ${budgets.maxDistCssKb}KB`);
  }

  if (maxImageMb > budgets.maxDistSingleImageMb) {
    errors.push(
      `largest dist image ${maxImageMb.toFixed(2)}MB exceeds budget ${budgets.maxDistSingleImageMb}MB`
    );
  }

  if (totalImageMb > budgets.maxDistImagesTotalMb) {
    errors.push(
      `total dist images ${totalImageMb.toFixed(2)}MB exceeds budget ${budgets.maxDistImagesTotalMb}MB`
    );
  }
}

console.log("Visual performance audit metrics:");
console.log(`- backdropBlurDecls=${backdropBlurDecls}`);
console.log(`- filterBlurDecls=${filterBlurDecls}`);
console.log(`- maxBlurPx=${maxBlurPx}`);
console.log(`- distCssKb=${cssKb.toFixed(2)}`);
console.log(`- distImagesCount=${imageSizes.length}`);
console.log(`- distLargestImageMb=${maxImageMb.toFixed(2)}`);
console.log(`- distImagesTotalMb=${totalImageMb.toFixed(2)}`);

if (imageSizes.length > 0) {
  const topHeavy = [...imageSizes]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 3)
    .map((item) => `${item.file} (${(item.bytes / (1024 * 1024)).toFixed(2)}MB)`);
  console.log(`- topDistImages=${topHeavy.join(", ")}`);
}

if (errors.length > 0) {
  console.error("Visual performance audit failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Visual performance audit passed.");
