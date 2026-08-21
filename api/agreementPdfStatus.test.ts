import { describe, expect, it } from 'vitest';

import { buildAgreementPdfStatusResponse } from './agreementPdfStatus.js';

describe('agreement PDF status response', () => {
  it('does not expose storage paths or signed URLs for a ready artifact', () => {
    const response = buildAgreementPdfStatusResponse({
      failure_code: null,
      generated_at: '2026-08-21T00:00:00.000Z',
      generation_status: 'ready',
      storage_path: 'private/agreement.pdf',
    } as never);

    expect(response).toEqual({
      artifact_status: 'ready',
      failure_code: null,
      generated_at: '2026-08-21T00:00:00.000Z',
    });
    expect(response).not.toHaveProperty('signed_url');
    expect(response).not.toHaveProperty('storage_path');
  });
});
