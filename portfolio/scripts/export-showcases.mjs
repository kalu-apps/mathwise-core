#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..', '..');
const sourceDir = path.join(rootDir, 'math-tutor-frontend');
const outputRoot = path.join(rootDir, 'portfolio-repos');
const templateRoot = path.join(rootDir, 'portfolio', 'templates');

const showcases = [
  {
    id: 'whiteboard',
    repoName: 'math-whiteboard-demo',
    title: 'Math Whiteboard Demo',
    openRoute: '/workbook',
    autoLoginEmail: 'teacher@axiom.demo',
    autoLoginPassword: 'magic',
    readmeTemplate: 'whiteboard.md',
  },
  {
    id: 'realtime',
    repoName: 'math-realtime-lesson-demo',
    title: 'Math Realtime Lesson Demo',
    openRoute: '/workbook',
    autoLoginEmail: 'teacher@axiom.demo',
    autoLoginPassword: 'magic',
    readmeTemplate: 'realtime.md',
  },
  {
    id: 'assistant',
    repoName: 'math-axiom-assistant-demo',
    title: 'Axiom Assistant Demo',
    openRoute: '/teacher/profile',
    autoLoginEmail: 'teacher@axiom.demo',
    autoLoginPassword: 'magic',
    readmeTemplate: 'assistant.md',
  },
];

const excluded = new Set([
  'node_modules',
  'dist',
  '.git',
  '.DS_Store',
  'visual-baseline',
  'visual-current',
]);

const stringReplacements = new Map([
  ['kalygina73@mail.ru', 'teacher@axiom.demo'],
  ['iwankalugin13@gmail.com', 'student@axiom.demo'],
  ['Анна', 'Преподаватель'],
  ['Калугина', 'Аксиомова'],
  ['Иван', 'Ученик'],
  ['Калугин', 'Демо'],
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyProject(src, dst) {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (entry) => {
      const base = path.basename(entry);
      if (excluded.has(base)) return false;
      if (base.endsWith('.log')) return false;
      return true;
    },
  });
}

function replaceInFile(filePath, replacer) {
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = replacer(original);
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
  }
}

function deepReplace(value) {
  if (typeof value === 'string') {
    let next = value;
    for (const [from, to] of stringReplacements) {
      next = next.split(from).join(to);
    }
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepReplace(item));
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, val] of Object.entries(value)) {
      output[key] = deepReplace(val);
    }
    return output;
  }
  return value;
}

function sanitizeMockDb(repoPath) {
  const dbPath = path.join(repoPath, 'mock-db.json');
  if (!fs.existsSync(dbPath)) return;
  const raw = fs.readFileSync(dbPath, 'utf8');
  const parsed = JSON.parse(raw);
  const sanitized = deepReplace(parsed);
  fs.writeFileSync(dbPath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
}

function patchAuthConstants(repoPath) {
  const constantsPath = path.join(repoPath, 'src', 'features', 'auth', 'model', 'constants.ts');
  if (!fs.existsSync(constantsPath)) return;
  replaceInFile(constantsPath, (content) =>
    content.replace(/export const TEACHER_CANONICAL_EMAIL = \"[^\"]+\";/, 'export const TEACHER_CANONICAL_EMAIL = "teacher@axiom.demo";')
  );
}

function patchGitignore(repoPath) {
  const ignorePath = path.join(repoPath, '.gitignore');
  if (!fs.existsSync(ignorePath)) return;
  replaceInFile(ignorePath, (content) =>
    content
      .split('\n')
      .filter((line) => line.trim() !== 'mock-db.json')
      .join('\n')
  );
}

function patchPackageJson(repoPath, showcase) {
  const packagePath = path.join(repoPath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.name = showcase.repoName;
  pkg.private = false;
  pkg.scripts = {
    ...pkg.scripts,
    'dev:showcase': `vite --mode showcase --open ${showcase.openRoute}`,
    'build:showcase': 'vite build --mode showcase',
  };
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function writeShowcaseEnv(repoPath, showcase) {
  const envContent = [
    `VITE_SHOWCASE_MODE=${showcase.id}`,
    `VITE_SHOWCASE_AUTO_LOGIN_EMAIL=${showcase.autoLoginEmail}`,
    `VITE_SHOWCASE_AUTO_LOGIN_PASSWORD=${showcase.autoLoginPassword}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(repoPath, '.env.showcase'), envContent, 'utf8');
}

function writeReadme(repoPath, showcase) {
  const templatePath = path.join(templateRoot, showcase.readmeTemplate);
  let template = fs.readFileSync(templatePath, 'utf8');
  template = template
    .replaceAll('{{TITLE}}', showcase.title)
    .replaceAll('{{OPEN_ROUTE}}', showcase.openRoute);
  fs.writeFileSync(path.join(repoPath, 'README.md'), template, 'utf8');
}

function writePortfolioNote(repoPath, showcase) {
  const note = [
    '# Внутренние заметки для портфолио',
    '',
    `- Showcase: ${showcase.id}`,
    `- Рекомендуемый маршрут демо: ${showcase.openRoute}`,
    `- Автовход: ${showcase.autoLoginEmail}`,
    '- Публикация: GitHub public + Vercel/Netlify demo URL в README.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(repoPath, 'PORTFOLIO_NOTES.md'), note, 'utf8');
}

function run() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source not found: ${sourceDir}`);
  }

  ensureDir(outputRoot);

  for (const showcase of showcases) {
    const target = path.join(outputRoot, showcase.repoName);
    removeDir(target);
    copyProject(sourceDir, target);
    sanitizeMockDb(target);
    patchAuthConstants(target);
    patchGitignore(target);
    patchPackageJson(target, showcase);
    writeShowcaseEnv(target, showcase);
    writeReadme(target, showcase);
    writePortfolioNote(target, showcase);
    console.log(`✔ exported: ${showcase.repoName}`);
  }

  console.log(`\nDone. Showcase repos are in: ${outputRoot}`);
}

run();
