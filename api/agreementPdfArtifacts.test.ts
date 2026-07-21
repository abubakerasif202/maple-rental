import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderSavedAgreementPdf } from './agreementPdfArtifacts.js';

describe('immutable agreement PDF rendering', () => {
  it('renders optional blanks, long fields, manual bond states, and multi-page content', async () => {
    const content = [
      `Driver: ${'Very Long Applicant Name '.repeat(12)}`,
      'DOB: ',
      `Address: ${'123 Long Address Road, Sydney NSW '.repeat(20)}`,
      `Vehicle / Number Plate: ${'REGISTRATION-TEXT-'.repeat(10)}`,
      'Bond status: unpaid; method: manual',
      'Bond status: paid; method: bank transfer',
      'Bond status: existing driver; method: recorded in agreement only',
      'Terms\n'.repeat(500),
    ].join('\n');
    const pdf = await renderSavedAgreementPdf(content);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it('produces a stable SHA-256 for identical immutable source content', async () => {
    const first = await renderSavedAgreementPdf('Immutable saved agreement');
    const second = await renderSavedAgreementPdf('Immutable saved agreement');
    expect(crypto.createHash('sha256').update(first).digest('hex'))
      .toBe(crypto.createHash('sha256').update(second).digest('hex'));
  });
});
