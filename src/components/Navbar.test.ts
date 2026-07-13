import { describe, expect, it } from 'vitest';
import { isNavigationPathActive } from './Navbar';

describe('isNavigationPathActive', () => {
  it('marks home current only when the contact fragment is not active', () => {
    expect(isNavigationPathActive('/', '/', '')).toBe(true);
    expect(isNavigationPathActive('/', '/', '#contact')).toBe(false);
  });

  it('marks contact current only for the home contact fragment', () => {
    expect(isNavigationPathActive('/#contact', '/', '#contact')).toBe(true);
    expect(isNavigationPathActive('/#contact', '/', '')).toBe(false);
    expect(isNavigationPathActive('/#contact', '/pricing', '#contact')).toBe(false);
  });

  it('matches non-fragment routes by pathname', () => {
    expect(isNavigationPathActive('/pricing', '/pricing', '')).toBe(true);
    expect(isNavigationPathActive('/pricing', '/apply', '')).toBe(false);
  });
});
