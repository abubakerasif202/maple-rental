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

  it('names admin navigation controls and announces dynamic admin feedback', () => {
    const dashboardSource = readSource('src/pages/AdminDashboard.tsx');
    const sidebarSource = readSource('src/components/admin/Sidebar.tsx');

    expect(dashboardSource).toContain('aria-label="Open admin navigation"');
    expect(dashboardSource).toContain('aria-expanded={isSidebarOpen}');
    expect(dashboardSource).toContain('aria-controls="admin-navigation"');
    expect(dashboardSource).toContain("role={notification.type === 'success' ? 'status' : 'alert'}");
    expect(dashboardSource).toContain('aria-atomic="true"');
    expect(sidebarSource).toContain("aria-current={selected ? 'page' : undefined}");
  });

  it('moves focus to each newly displayed application step', () => {
    const applySource = readSource('src/pages/Apply.tsx');

    expect(applySource).toContain('document.getElementById(`application-step-${step}-title`)?.focus()');
    expect(applySource).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(applySource).toContain('headingId="application-step-2-title"');
  });

  it('uses contrast-safe error text tokens in the inquiry form', () => {
    const inquirySource = readSource('src/components/InquiryForm.tsx');

    expect(inquirySource).not.toContain('role="alert" className="text-red-500');
    expect(inquirySource).toContain('role="alert" className="text-red-300');
  });
});
