import { describe, expect, it } from 'vitest';
import { getErrorDetails, isChunkLoadError } from './ErrorBoundary';

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

describe('getErrorDetails', () => {
  it('does not expose raw exception messages in production', () => {
    expect(getErrorDetails(new Error('Sensitive internal detail'), false)).toBeNull();
  });

  it('keeps raw exception messages available during development', () => {
    expect(getErrorDetails(new Error('Useful development detail'), true)).toBe(
      'Useful development detail',
    );
  });
});
