import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const targets = ['server', 'jobs', 'scripts'];
const allowedExtensions = new Set(['.js', '.mjs']);

const collectFiles = (directory) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath));
      continue;
    }

    if (allowedExtensions.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
};

const files = targets
  .map((target) => path.join(root, target))
  .filter((target) => fs.existsSync(target))
  .flatMap((target) => collectFiles(target))
  .sort((left, right) => left.localeCompare(right));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} runtime files.`);
