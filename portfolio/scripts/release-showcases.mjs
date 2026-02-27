#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..', '..');
const releaseRoot = path.join(rootDir, 'portfolio', 'releases');
const defaultConfigPath = path.join(releaseRoot, 'showcase-release.config.json');
const historyPath = path.join(releaseRoot, 'showcase-release-history.json');
const archiveRoot = path.join(releaseRoot, 'archive');
const exportScriptPath = path.join(rootDir, 'portfolio', 'scripts', 'export-showcases.mjs');

const showcaseMap = {
  whiteboard: {
    title: 'Math Whiteboard Demo',
    repoName: 'math-whiteboard-demo',
  },
  realtime: {
    title: 'Math Realtime Lesson Demo',
    repoName: 'math-realtime-lesson-demo',
  },
  assistant: {
    title: 'Axiom Assistant Demo',
    repoName: 'math-axiom-assistant-demo',
  },
};

const validIds = new Set(Object.keys(showcaseMap));

function parseArgs(argv) {
  const output = {
    config: defaultConfigPath,
    dryRun: false,
    skipExport: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      output.dryRun = true;
      continue;
    }
    if (arg === '--skip-export') {
      output.skipExport = true;
      continue;
    }
    if (arg.startsWith('--config=')) {
      output.config = path.resolve(rootDir, arg.split('=').slice(1).join('='));
      continue;
    }
    if (arg === '--config') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('Ожидался путь после --config');
      }
      output.config = path.resolve(rootDir, next);
      i += 1;
      continue;
    }
    throw new Error(`Неизвестный аргумент: ${arg}`);
  }

  return output;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runCommand(command, args) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeList(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeReleaseConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Некорректный release-конфиг: корень должен быть объектом');
  }

  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  if (!version) {
    throw new Error('Некорректный release-конфиг: поле "version" обязательно');
  }

  const releaseDate = typeof raw.releaseDate === 'string' && raw.releaseDate.trim()
    ? raw.releaseDate.trim()
    : new Date().toISOString().slice(0, 10);

  const notes = raw.notes;
  if (!notes || typeof notes !== 'object') {
    throw new Error('Некорректный release-конфиг: поле "notes" обязательно');
  }

  const normalizedNotes = {};
  for (const [id, data] of Object.entries(notes)) {
    if (!validIds.has(id)) {
      throw new Error(`Некорректный showcase id в notes: ${id}`);
    }
    const section = data && typeof data === 'object' ? data : {};
    normalizedNotes[id] = {
      added: normalizeList(section.added),
      fixed: normalizeList(section.fixed),
    };
  }

  return { version, releaseDate, notes: normalizedNotes };
}

function loadHistory() {
  if (!fs.existsSync(historyPath)) {
    return { releases: [] };
  }
  const parsed = loadJson(historyPath);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.releases)) {
    return { releases: [] };
  }
  return parsed;
}

function stringifyBulletList(items) {
  if (!items.length) {
    return '- без изменений';
  }
  return items.map((item) => `- ${item}`).join('\n');
}

function buildReleaseBlock(releaseConfig, coreFrom, coreTo, showcaseId) {
  const notes = releaseConfig.notes[showcaseId] ?? { added: [], fixed: [] };
  const coreRange = `${coreFrom.slice(0, 7)}..${coreTo.slice(0, 7)}`;
  return [
    `## ${releaseConfig.version} — ${releaseConfig.releaseDate}`,
    '',
    `Источник: core \`${coreRange}\``,
    '',
    '### Добавлено',
    stringifyBulletList(notes.added),
    '',
    '### Исправлено',
    stringifyBulletList(notes.fixed),
    '',
  ].join('\n');
}

function injectReleaseEntry(changelogContent, releaseBlock, version) {
  if (changelogContent.includes(`## ${version}`)) {
    throw new Error(`Версия ${version} уже есть в CHANGELOG`);
  }

  const normalized = changelogContent.trim();
  if (!normalized) {
    return `${releaseBlock}\n`;
  }

  const headerMatch = normalized.match(/^#[^\n]*\n*/);
  if (!headerMatch) {
    return `${normalized}\n\n${releaseBlock}\n`;
  }

  const header = headerMatch[0].trimEnd();
  const rest = normalized.slice(headerMatch[0].length).trimStart();
  if (!rest) {
    return `${header}\n\n${releaseBlock}\n`;
  }

  return `${header}\n\n${releaseBlock}\n${rest}\n`;
}

function ensureChangelogHeader(showcaseId) {
  const showcase = showcaseMap[showcaseId];
  const repoPath = path.join(rootDir, 'portfolio-repos', showcase.repoName);
  const changelogPath = path.join(repoPath, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
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

function applyChangelogUpdates(releaseConfig, coreFrom, coreTo, dryRun) {
  for (const showcaseId of Object.keys(showcaseMap)) {
    ensureChangelogHeader(showcaseId);
    const showcase = showcaseMap[showcaseId];
    const repoPath = path.join(rootDir, 'portfolio-repos', showcase.repoName);
    const changelogPath = path.join(repoPath, 'CHANGELOG.md');
    const current = fs.readFileSync(changelogPath, 'utf8');
    const releaseBlock = buildReleaseBlock(releaseConfig, coreFrom, coreTo, showcaseId);
    const nextContent = injectReleaseEntry(current, releaseBlock, releaseConfig.version);

    if (!dryRun) {
      fs.writeFileSync(changelogPath, nextContent, 'utf8');
    }

    console.log(`${dryRun ? '• preview' : '✔ changelog'}: ${showcase.repoName}`);
  }
}

function saveReleaseArtifacts(releaseConfig, coreFrom, coreTo, configPath, dryRun) {
  const history = loadHistory();
  history.releases.push({
    version: releaseConfig.version,
    releaseDate: releaseConfig.releaseDate,
    coreFrom,
    coreTo,
    createdAt: new Date().toISOString(),
    configPath: path.relative(rootDir, configPath),
  });

  if (dryRun) {
    return;
  }

  ensureDir(releaseRoot);
  ensureDir(archiveRoot);

  fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');

  const safeVersion = releaseConfig.version.replace(/[^a-zA-Z0-9._-]/g, '-');
  const archivePath = path.join(archiveRoot, `${safeVersion}.json`);
  fs.writeFileSync(
    archivePath,
    `${JSON.stringify(
      {
        ...releaseConfig,
        coreFrom,
        coreTo,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.config)) {
    throw new Error(
      `Не найден release-конфиг: ${args.config}\n` +
      'Создайте файл на основе portfolio/releases/showcase-release.config.example.json',
    );
  }

  const releaseConfig = normalizeReleaseConfig(loadJson(args.config));

  const coreTo = runCommand('git', ['rev-parse', 'HEAD']);
  const history = loadHistory();
  const defaultCoreFrom = runCommand('git', ['rev-list', '--max-parents=0', 'HEAD']);
  const coreFrom = history.releases.length
    ? history.releases[history.releases.length - 1].coreTo
    : defaultCoreFrom;

  console.log(`Release: ${releaseConfig.version} (${releaseConfig.releaseDate})`);
  console.log(`Core range: ${coreFrom.slice(0, 7)}..${coreTo.slice(0, 7)}`);

  if (!args.skipExport) {
    if (args.dryRun) {
      console.log('• preview export: portfolio/scripts/export-showcases.mjs');
    } else {
      execFileSync('node', [exportScriptPath], {
        cwd: rootDir,
        stdio: 'inherit',
      });
    }
  }

  applyChangelogUpdates(releaseConfig, coreFrom, coreTo, args.dryRun);
  saveReleaseArtifacts(releaseConfig, coreFrom, coreTo, args.config, args.dryRun);

  if (args.dryRun) {
    console.log('Dry-run завершён. Изменения не записаны.');
    return;
  }

  console.log('\nDone.');
  console.log('Следующие шаги:');
  console.log('1) проверить showcase репозитории: npm run lint && npm run build');
  console.log('2) закоммитить changelog + release history');
  console.log('3) запушить в соответствующие showcase origin/main');
}

run();
