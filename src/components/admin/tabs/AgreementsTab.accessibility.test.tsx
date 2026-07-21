// @vitest-environment jsdom

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgreementsTab from './AgreementsTab';

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    fetchAgreementTemplates: vi.fn().mockResolvedValue([]),
    fetchSavedAgreementPdfStatus: vi.fn().mockResolvedValue({ artifact_status: 'pending' }),
  };
});

afterEach(() => cleanup());

const renderAgreementsTab = (artifactStatus: 'generating' | 'failed') => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['agreement-pdf', 7], {
    artifact_status: artifactStatus,
  });

  return render(
    <QueryClientProvider client={client}>
      <AgreementsTab
        approvedApplications={[]}
        selected_agreement_application_id=""
        set_selected_agreement_application_id={vi.fn()}
        isGeneratingAgreement={false}
        handleGenerateAgreement={vi.fn()}
        canCopyVehicleCheckoutLink={false}
        generateCheckoutLinkMutation={{ isPending: false } as never}
        handleCopyVehicleCheckoutLink={vi.fn()}
        savedAgreements={[
          {
            id: 7,
            application_id: 'a',
            content: 'saved',
            status: 'final',
            created_at: '2026-01-01T00:00:00Z',
            applicant_name: 'Alex Driver',
          },
        ]}
        setAgreementModalMode={vi.fn()}
        setAgreementContent={vi.fn()}
        setIsAgreementModalOpen={vi.fn()}
      />
    </QueryClientProvider>,
  );
};

describe('saved agreement actions', () => {
  it('exposes focusable mobile and desktop view buttons with unique accessible names', () => {
    renderAgreementsTab('failed');
    const buttons = screen.getAllByRole('button', {
      name: /view saved agreement for alex driver/i,
    });

    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'View saved agreement for Alex Driver (mobile)',
      'View saved agreement for Alex Driver (desktop)',
    ]);
    for (const button of buttons) {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.tabIndex).toBe(0);
      expect(button.className).toContain('focus-visible:outline');
      button.focus();
      expect(document.activeElement).toBe(button);
      expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(buttons[0].className).toContain('min-h-11');
    expect(buttons[1].className).toContain('h-11');
    expect(buttons[1].className).toContain('w-11');
  });

  it('uses server-derived generating and retry states for both responsive PDF actions', () => {
    const generating = renderAgreementsTab('generating');
    const generatingButtons = screen.getAllByRole('button', {
      name: /generate saved agreement pdf for alex driver/i,
    });
    expect(generatingButtons).toHaveLength(2);
    for (const button of generatingButtons) {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.className).toContain('min-h-11');
    }

    generating.unmount();
    renderAgreementsTab('failed');
    const retryButtons = screen.getAllByRole('button', {
      name: /retry saved agreement pdf for alex driver/i,
    });
    expect(retryButtons).toHaveLength(2);
    for (const button of retryButtons) {
      expect(button.hasAttribute('disabled')).toBe(false);
      expect(button.tabIndex).toBe(0);
      expect(button.textContent).toMatch(/Retry PDF/);
    }
  });
});
