import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const MAX_HOMEPAGE_STARTUP_JS_GZIP_BYTES = 170_000;

export const collectStartupAssets = (manifest, routeKey = 'src/pages/Home.tsx') => {
  const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
  if (!entryKey) {
    throw new Error('No client entry was found in the Vite manifest.');
  }
  if (!manifest[routeKey]) {
    throw new Error(`The homepage route "${routeKey}" was not found in the Vite manifest.`);
  }

  const visitedKeys = new Set();
  const assetNames = new Set();
  const visit = (key) => {
    if (visitedKeys.has(key)) {
      return;
    }
    visitedKeys.add(key);

    const chunk = manifest[key];
    if (!chunk) {
      throw new Error(`Manifest dependency "${key}" was not found.`);
    }

    if (chunk.file?.endsWith('.js')) {
      assetNames.add(chunk.file);
    }
    for (const importedKey of chunk.imports || []) {
      visit(importedKey);
    }
  };

  visit(entryKey);
  visit(routeKey);
  return [...assetNames];
};

export const assertWithinBudget = (
  totalGzipBytes,
  maxGzipBytes = MAX_HOMEPAGE_STARTUP_JS_GZIP_BYTES
) => {
  const summary = `${totalGzipBytes.toLocaleString()} / ${maxGzipBytes.toLocaleString()} bytes gzip`;
  if (totalGzipBytes > maxGzipBytes) {
    throw new Error(`Homepage startup JavaScript exceeds the bundle budget: ${summary}.`);
  }
  return `Homepage startup JavaScript is within budget: ${summary}.`;
};

export const checkClientBundleBudget = async ({
  distDir = path.resolve(process.cwd(), 'dist'),
  maxGzipBytes = MAX_HOMEPAGE_STARTUP_JS_GZIP_BYTES,
} = {}) => {
  const manifestPath = path.join(distDir, '.vite', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const assetNames = collectStartupAssets(manifest);

  let totalGzipBytes = 0;
  for (const assetName of assetNames) {
    const source = await readFile(path.join(distDir, assetName));
    totalGzipBytes += gzipSync(source).byteLength;
  }

  return {
    assetNames,
    message: assertWithinBudget(totalGzipBytes, maxGzipBytes),
    totalGzipBytes,
  };
};

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  const result = await checkClientBundleBudget();
  console.log(result.message);
}
