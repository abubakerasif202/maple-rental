import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('public form and navigation accessibility contracts', () => {
  it('associates form errors with invalid controls and announces page errors', () => {
    const applySource = readSource('src/pages/Apply.tsx');
    const inquirySource = readSource('src/components/InquiryForm.tsx');

    expect(applySource).toContain('aria-invalid={Boolean(errors.name)}');
    expect(applySource).toContain('aria-describedby={errors.name');
    expect(applySource).toContain('role="alert" aria-live="assertive"');
    expect(applySource).toContain('{ shouldFocus: true }');
    expect(inquirySource).toContain('aria-invalid={Boolean(errors.email)}');
    expect(inquirySource).toContain('id="inquiry-email-error" role="alert"');
  });

  it('keeps the mobile navigation modal keyboard-contained and restorable', () => {
    const navbarSource = readSource('src/components/Navbar.tsx');

    expect(navbarSource).toContain('role="dialog"');
    expect(navbarSource).toContain('aria-modal="true"');
    expect(navbarSource).toContain("event.key === 'Escape'");
    expect(navbarSource).toContain("event.key !== 'Tab'");
    expect(navbarSource).toContain('mobileToggleRef.current?.focus()');
  });
});
