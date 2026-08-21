import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const renderConfig = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');

describe('Render production environment contract', () => {
  it.each([
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'CHECKOUT_LINK_SECRET',
    'JWT_SECRET',
    'RESEND_API_KEY',
  ])('declares %s as an operator-supplied secret', (key) => {
    expect(renderConfig).toMatch(
      new RegExp(`- key: ${key}\\s+sync: false`),
    );
  });
});
