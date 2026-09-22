import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const vercelConfig = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
) as {
  buildCommand?: string;
  framework?: string;
  functions?: Record<string, { includeFiles?: string }>;
  outputDirectory?: string;
  rewrites?: Array<{ source?: string; destination?: string }>;
};

describe('Vercel deployment contract', () => {
  it('builds the Vite output with the Express function template files included', () => {
    expect(vercelConfig.framework).toBe('vite');
    expect(vercelConfig.buildCommand).toBe('npm run build');
    expect(vercelConfig.outputDirectory).toBe('dist');
    expect(vercelConfig.functions?.['api/index.ts']?.includeFiles).toBe('dist/forms/**');
    expect(vercelConfig.functions?.['api/[...path].ts']?.includeFiles).toBe('dist/forms/**');
  });

  it('routes API requests before the SPA fallback', () => {
    expect(vercelConfig.rewrites).toEqual([
      {
        source: '/((?!api(?:/|$)).*)',
        destination: '/index.html',
      },
    ]);
  });
});
