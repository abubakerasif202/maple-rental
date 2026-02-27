import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'path';
import {ensureEsbuildBinaryPath} from './ensureEsbuildBinaryPath.js';

ensureEsbuildBinaryPath();

const require = createRequire(import.meta.url);
const vitePackageJson = require.resolve('vite/package.json');
const viteCli = path.join(path.dirname(vitePackageJson), 'bin', 'vite.js');
const args = process.argv.slice(2);
const env = {...process.env};

const result = spawnSync(process.execPath, [viteCli, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env,
});

if (result.error) {
  console.error('Vite failed to start:', result.error);
}

process.exit(result.status ?? (result.error ? 1 : 0));
