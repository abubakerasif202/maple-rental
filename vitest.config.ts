import { configDefaults, defineConfig } from 'vitest/config';
import { createViteConfig } from './vite.config';

export default defineConfig({
  ...createViteConfig(),
  test: {
    // `.claude/**` keeps agent worktrees under .claude/worktrees/ out of test
    // discovery. A worktree is a full copy of the repository, so without this
    // Vitest collects every suite twice; the duplicate Supertest servers then
    // fail with ECONNREFUSED, timeouts, and cross-suite mock interference.
    exclude: [
      ...configDefaults.exclude,
      '.claude/**',
      'e2e/**',
      'server-dist/**',
      'dist/**',
      'tmp/**',
    ],
  },
});
