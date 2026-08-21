import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  canonicalForRoute,
  ROUTE_METADATA,
  SOCIAL_IMAGE_URL,
} from './route-metadata.mjs';

const distDirectory = path.resolve(process.cwd(), 'dist');
const sourcePath = path.join(distDirectory, 'index.html');
const sourceHtml = await readFile(sourcePath, 'utf8');

const escapeAttribute = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const replaceTag = (html, pattern, replacement, label) => {
  if (!pattern.test(html)) {
    throw new Error(`Unable to generate route metadata: ${label} tag is missing.`);
  }
  return html.replace(pattern, replacement);
};

const renderMetadata = (route, metadata) => {
  const canonical = canonicalForRoute(route);
  const title = escapeAttribute(metadata.title);
  const description = escapeAttribute(metadata.description);
  let html = sourceHtml;

  html = replaceTag(html, /<title>[^<]*<\/title>/i, `<title>${title}</title>`, 'title');
  html = replaceTag(html, /<meta name="description" content="[^"]*"\s*\/>/i, `<meta name="description" content="${description}" />`, 'description');
  html = replaceTag(html, /<link rel="canonical" href="[^"]*"\s*\/>/i, `<link rel="canonical" href="${canonical}" />`, 'canonical');
  html = replaceTag(html, /<meta property="og:title" content="[^"]*"\s*\/>/i, `<meta property="og:title" content="${title}" />`, 'og:title');
  html = replaceTag(html, /<meta property="og:description" content="[^"]*"\s*\/>/i, `<meta property="og:description" content="${description}" />`, 'og:description');
  html = replaceTag(html, /<meta property="og:url" content="[^"]*"\s*\/>/i, `<meta property="og:url" content="${canonical}" />`, 'og:url');
  html = replaceTag(html, /<meta property="og:image" content="[^"]*"\s*\/>/i, `<meta property="og:image" content="${SOCIAL_IMAGE_URL}" />`, 'og:image');
  html = replaceTag(html, /<meta name="twitter:title" content="[^"]*"\s*\/>/i, `<meta name="twitter:title" content="${title}" />`, 'twitter:title');
  html = replaceTag(html, /<meta name="twitter:description" content="[^"]*"\s*\/>/i, `<meta name="twitter:description" content="${description}" />`, 'twitter:description');

  return html;
};

for (const [route, metadata] of Object.entries(ROUTE_METADATA)) {
  const html = renderMetadata(route, metadata);
  const destination = route === '/'
    ? sourcePath
    : path.join(distDirectory, route.slice(1), 'index.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html, 'utf8');
}

console.log(`Generated delivered metadata HTML for ${Object.keys(ROUTE_METADATA).join(', ')}.`);
