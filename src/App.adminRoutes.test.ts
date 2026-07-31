import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

const protectedAdminPaths = [
  '/admin/dashboard',
  '/admin/applications',
  '/admin/rentals',
  '/admin/customers',
  '/admin/invoices',
  '/admin/financials',
  '/admin/agreements',
  '/admin/toll-notices',
  '/admin/maintenance',
  '/admin/fleet-imports',
];

describe('admin application routes', () => {
  it('redirects the admin root to the dashboard', () => {
    expect(appSource).toContain(
      '<Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />'
    );
  });

  it.each(protectedAdminPaths)('protects %s with AdminDashboardRoute', (path) => {
    expect(appSource).toContain(`<Route path="${path}" element={<AdminDashboard />} />`);
  });

  it('keeps the wildcard route on the normal not-found page', () => {
    expect(appSource).toContain('<Route path="*" element={<NotFound />} />');
  });
});
