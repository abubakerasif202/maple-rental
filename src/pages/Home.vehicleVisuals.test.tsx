// @vitest-environment jsdom

import React, { forwardRef, type HTMLAttributes } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from '../lib/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Home from './Home';

const apiMocks = vi.hoisted(() => ({
  fetchRentalPlans: vi.fn(),
}));

vi.mock('../lib/api', () => apiMocks);

vi.mock('../components/DeferredInquiryForm', () => ({
  default: () => null,
}));

vi.mock('../components/Seo', () => ({
  default: () => null,
}));

vi.mock('motion/react', () => {
  const createMotionComponent = (tag: string) =>
    forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & Record<string, unknown>>(
      (
        {
          animate: _animate,
          initial: _initial,
          transition: _transition,
          variants: _variants,
          viewport: _viewport,
          whileInView: _whileInView,
          ...props
        },
        ref,
      ) => React.createElement(tag, { ...props, ref }),
    );

  return {
    motion: new Proxy({}, {
      get: (_target, tag: string) => createMotionComponent(tag),
    }),
  };
});

const renderHome = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Home vehicle visuals', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses the XSE hero eagerly and presents four responsive Camry Hybrid cards', () => {
    apiMocks.fetchRentalPlans.mockResolvedValue([]);
    renderHome();

    const hero = screen.getByRole('img', {
      name: 'Bright metallic blue 2026 Toyota Camry Hybrid XSE AWD',
    });
    expect(hero.getAttribute('src')).toBe('/2026-camry-hybrid-xse-awd-blue.webp');
    expect(hero.getAttribute('srcset')).toContain(
      '/2026-camry-hybrid-xse-awd-blue-1200.webp 1200w',
    );
    expect(hero.getAttribute('loading')).toBeNull();
    expect(hero.getAttribute('fetchpriority')).toBe('high');

    const cardImages = [
      ['Red 2026 Toyota Camry Hybrid SE FWD', '/2026-camry-hybrid-se-fwd-red.webp'],
      [
        'White 2026 Toyota Camry Hybrid SE Upgrade AWD',
        '/2026-camry-hybrid-se-upgrade-awd-white.webp',
      ],
      ['Blue 2026 Toyota Camry Hybrid XLE AWD', '/2026-camry-hybrid-xle-awd-blue.webp'],
      ['Blue 2026 Toyota Camry Hybrid XSE AWD', '/2026-camry-hybrid-xse-awd-blue.webp'],
    ];

    cardImages.forEach(([alt, src]) => {
      const image = screen.getByRole('img', { name: alt });
      expect(image.getAttribute('src')).toBe(src);
      expect(image.getAttribute('srcset')).toContain('480w');
      expect(image.getAttribute('srcset')).toContain('800w');
      expect(image.getAttribute('loading')).toBe('lazy');
      expect(image.getAttribute('decoding')).toBe('async');
      expect(image.getAttribute('width')).toBe('800');
      expect(image.getAttribute('height')).toBe('600');
    });
  });
});
