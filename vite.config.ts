import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { configDefaults } from 'vitest/config';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const isNodeModule = (id: string, packageName: string) =>
    id.includes(`/node_modules/${packageName}/`) || id.includes(`\\node_modules\\${packageName}\\`);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return;
            }

            if (
              isNodeModule(id, 'react') ||
              isNodeModule(id, 'react-dom') ||
              isNodeModule(id, 'react-router-dom')
            ) {
              return 'vendor';
            }

            if (isNodeModule(id, '@tanstack/react-query')) {
              return 'react-query';
            }

            if (isNodeModule(id, 'axios')) {
              return 'http';
            }

            if (
              isNodeModule(id, 'react-hook-form') ||
              isNodeModule(id, '@hookform/resolvers') ||
              isNodeModule(id, 'zod')
            ) {
              return 'forms';
            }

            if (isNodeModule(id, 'motion')) {
              return 'motion';
            }

            if (isNodeModule(id, 'lucide-react')) {
              return 'icons';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
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
  };
});
