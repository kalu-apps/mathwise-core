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
  '.github',
  '.DS_Store',
  '.vscode',
  'docs',
  'reports',
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

function clearTargetPreservingGit(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === '.git') continue;
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
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

function writeLicense(repoPath) {
  const content = [
    'All Rights Reserved',
    '',
    'Copyright (c) 2026 Иван Калугин',
    '',
    'Этот репозиторий опубликован только как showcase-демо для портфолио.',
    'Копирование, переработка, повторное использование, публикация и коммерческое применение',
    'полностью или частично без письменного разрешения правообладателя запрещены.',
    '',
    'Исходный private core-репозиторий является единственным источником правды.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(repoPath, 'LICENSE'), content, 'utf8');
}

function writeShowcaseNotice(repoPath, showcase) {
  const shared = [
    '# Showcase Notice',
    '',
    'Этот репозиторий — публичная витрина, а не полный продукт.',
    '',
    'Что важно:',
    '- часть внутренней инфраструктуры и организационной логики сознательно не публикуется;',
    '- private core-репозиторий остаётся единственным источником правды;',
    '- этот код предназначен для демонстрации архитектуры и UX, а не для свободного переиспользования;',
    '',
  ];

  const perShowcase = {
    whiteboard: [
      '## Whiteboard scope',
      '- сохранена достаточная фронтенд-логика для демонстрации интерактивной доски и подготовки к пилотному деплою;',
      '- логика whiteboard intentionally сохранена шире, чем у остальных showcase, чтобы не блокировать будущий Vercel smoke/pilot;',
      '- для реального одновременного урока teacher/student между разными устройствами нужен отдельный backend/realtime-слой, он не является частью этого публичного репозитория.',
    ],
    realtime: [
      '## Realtime lesson scope',
      '- демонстрируется UX и клиентская модель коллективного урока;',
      '- production-ready сетевой слой и медиасигналинг не раскрываются в публичной витрине.',
    ],
    assistant: [
      '## Assistant scope',
      '- демонстрируется UI/UX и продуктовая интеграция ассистента;',
      '- провайдеры, production-конфигурация и часть внутренних интеграций не публикуются.',
    ],
  };

  const content = [...shared, ...(perShowcase[showcase.id] ?? []), ''].join('\n');
  fs.writeFileSync(path.join(repoPath, 'SHOWCASE_NOTICE.md'), content, 'utf8');
}

function readExistingChangelog(repoPath) {
  const changelogPath = path.join(repoPath, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    return null;
  }
  return fs.readFileSync(changelogPath, 'utf8');
}

function ensureChangelog(repoPath, showcase, existingContent) {
  const changelogPath = path.join(repoPath, 'CHANGELOG.md');
  if (existingContent) {
    fs.writeFileSync(changelogPath, existingContent, 'utf8');
    return;
  }

  const initial = [
    `# Changelog — ${showcase.title}`,
    '',
    'Формат:',
    '- `Добавлено` — новые стабильные возможности, попавшие в showcase-срез.',
    '- `Исправлено` — стабильные багфиксы, попавшие в showcase-срез.',
    '',
    'Истина по разработке: private core-репозиторий. Showcase обновляется только релизными срезами.',
    '',
  ].join('\n');
  fs.writeFileSync(changelogPath, initial, 'utf8');
}

function run() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source not found: ${sourceDir}`);
  }

  ensureDir(outputRoot);

  for (const showcase of showcases) {
    const target = path.join(outputRoot, showcase.repoName);
    const existingChangelog = readExistingChangelog(target);
    ensureDir(target);
    clearTargetPreservingGit(target);
    copyProject(sourceDir, target);
    sanitizeMockDb(target);
    patchAuthConstants(target);
    patchGitignore(target);
    patchPackageJson(target, showcase);
    writeShowcaseEnv(target, showcase);
    writeReadme(target, showcase);
    writePortfolioNote(target, showcase);
    writeLicense(target);
    writeShowcaseNotice(target, showcase);
    ensureChangelog(target, showcase, existingChangelog);
    console.log(`✔ exported: ${showcase.repoName}`);
  }

  console.log(`\nDone. Showcase repos are in: ${outputRoot}`);
}

run();
