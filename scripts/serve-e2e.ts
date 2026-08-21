import path from 'node:path';

import express from 'express';

import {
  getSpaHtmlFile,
  isKnownSpaRoute,
  shouldServeSpaEntry,
} from '../api/frontendRouting.js';

const app = express();
const port = Number(process.env.E2E_PORT || 4173);
const distDirectory = path.resolve(process.cwd(), 'dist');

app.get('/api/auth/verify', (_req, res) => {
  res.status(401).json({ error: 'Unauthorized' });
});

app.use(express.static(distDirectory, { index: false, dotfiles: 'ignore' }));
app.use((req, res, next) => {
  if (!shouldServeSpaEntry(req)) {
    next();
    return;
  }

  if (!isKnownSpaRoute(req.path)) {
    res.status(404);
  }
  res.sendFile(path.join(distDirectory, getSpaHtmlFile(req.path)));
});
app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));

app.listen(port, '127.0.0.1', () => {
  console.log(`Maple E2E server listening on http://127.0.0.1:${port}`);
});
