import { describe, expect, it } from 'vitest';
import {
  collectReferencedPaths,
  extractStoragePath,
  selectEligibleOrphans,
} from './cleanup-orphaned-documents.js';

describe('document cleanup safety', () => {
  it('collects every current and legacy document field independently', () => {
    const paths = collectReferencedPaths([{
      license_photo: 'front.png',
      license_back_photo: 'back.png',
      uberScreenshot: 'legacy-uber.png',
      passport_or_uber_profile_screenshot: 'passport.pdf',
    }]);
    expect([...paths].sort()).toEqual(['back.png', 'front.png', 'legacy-uber.png', 'passport.pdf']);
  });

  it('extracts a storage path from signed URLs', () => {
    expect(extractStoragePath('https://example.supabase.co/storage/v1/object/sign/applications/folder/id.pdf?token=x'))
      .toBe('folder/id.pdf');
  });

  it('only selects old unreferenced files without active holds', () => {
    const orphans = selectEligibleOrphans({
      files: [
        { name: 'referenced.png', created_at: '2026-01-01T00:00:00Z' },
        { name: 'held.png', created_at: '2026-01-01T00:00:00Z' },
        { name: 'recent.png', created_at: '2026-07-01T00:00:00Z' },
        { name: 'old-orphan.png', created_at: '2026-01-01T00:00:00Z' },
        { name: 'unknown-age.png', created_at: null },
      ],
      heldPaths: new Set(['held.png']),
      now: new Date('2026-07-12T00:00:00Z'),
      referencedPaths: new Set(['referenced.png']),
    });
    expect(orphans).toEqual(['old-orphan.png']);
  });
});
