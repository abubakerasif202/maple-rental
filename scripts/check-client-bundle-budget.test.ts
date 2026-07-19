import { describe, expect, it } from 'vitest';

import {
  assertWithinBudget,
  collectStartupAssets,
} from './check-client-bundle-budget.mjs';

const manifest = {
  'index.html': {
    file: 'assets/entry.js',
    imports: ['shared.ts'],
    isEntry: true,
  },
  'shared.ts': {
    file: 'assets/shared.js',
  },
  'src/pages/Home.tsx': {
    file: 'assets/home.js',
    imports: ['shared.ts', 'motion.ts'],
    isDynamicEntry: true,
  },
  'src/pages/Pricing.tsx': {
    file: 'assets/pricing.js',
    imports: ['shared.ts'],
    isDynamicEntry: true,
  },
  'motion.ts': {
    file: 'assets/motion.js',
  },
};

describe('client bundle budget', () => {
  it('includes the entry and homepage route graph without unrelated lazy routes', () => {
    expect(collectStartupAssets(manifest)).toEqual([
      'assets/entry.js',
      'assets/shared.js',
      'assets/home.js',
      'assets/motion.js',
    ]);
  });

  it('fails when the measured homepage graph exceeds the budget', () => {
    expect(() => assertWithinBudget(171_000, 170_000)).toThrow(
      'Homepage startup JavaScript exceeds the bundle budget'
    );
  });
});
