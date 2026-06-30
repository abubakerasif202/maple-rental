import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './ErrorBoundary';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'ChunkLoadError: Loading chunk 12 failed',
    'Loading chunk 8 failed',
  ])('matches chunk failure message: %s', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it('ignores non chunk errors', () => {
    expect(isChunkLoadError(new Error('Unexpected render failure'))).toBe(false);
  });
});

