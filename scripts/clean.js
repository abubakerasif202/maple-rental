import fs from 'node:fs';

for (const dir of ['dist', 'server-dist']) {
  fs.rmSync(dir, { recursive: true, force: true });
}
