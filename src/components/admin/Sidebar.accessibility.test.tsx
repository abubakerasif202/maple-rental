// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from '../../lib/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Sidebar from './Sidebar';

const matchMedia = (matches: boolean): MediaQueryList => ({
  matches,
  media: '(min-width: 1024px)',
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

const renderSidebar = (isOpen: boolean, activeTab = 'dashboard') =>
  render(
    <MemoryRouter>
      <Sidebar
        activeTab={activeTab}
        handleLogout={vi.fn()}
        isCollapsed={false}
        isOpen={isOpen}
        onClose={vi.fn()}
        onToggleCollapse={vi.fn()}
        setActiveTab={vi.fn()}
      />
    </MemoryRouter>,
  );

describe('Sidebar accessibility', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => matchMedia(false)));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('removes the closed mobile sidebar from keyboard and accessibility navigation', () => {
    const { container } = renderSidebar(false);
    const aside = container.querySelector('#admin-navigation');
    const overlay = container.querySelector(':scope > button');

    expect(aside?.getAttribute('aria-hidden')).toBe('true');
    expect(aside?.hasAttribute('inert')).toBe(true);
    expect(overlay?.getAttribute('tabindex')).toBe('-1');
  });

  it('exposes the current section and moves focus into an open mobile sidebar', () => {
    renderSidebar(true, 'applications');

    expect(
      screen.getByRole('button', { name: 'Applications' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /MAPLE/i }));
  });

  it('exposes the fleet import workflow as a labelled navigation action', () => {
    renderSidebar(true, 'fleet-imports');
    const button = screen.getByRole('button', { name: 'Fleet Imports' });
    expect(button.getAttribute('aria-current')).toBe('page');
  });
});
