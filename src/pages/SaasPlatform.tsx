import { ChangeEvent, FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateSaasMerchantPayload,
  SaasAccountLinkResponse,
  createSaasMerchant,
  fetchSaasMerchants,
  refreshSaasAccountLink,
} from '../lib/api';
import { SaasMerchant } from '../types';

const payoutOptions: { label: string; value: CreateSaasMerchantPayload['payoutInterval'] }[] = [
  { label: 'Daily (fast Express payouts)', value: 'daily' },
  { label: 'Weekly (default, balanced cash flow)', value: 'weekly' },
  { label: 'Monthly (batch settlement)', value: 'monthly' },
];

const monetizationModels = [
  {
    title: 'Stripe-owned pricing',
    detail:
      'Connected merchants stay merchant of record, pay Stripe directly, and your platform earns subscription or application fees on top of their processing volume.',
  },
  {
    title: 'Buy-rate model',
    detail:
      'Your platform purchases processing at wholesale, becomes merchant of record, and can use destination or OBO charges while merchants settle with you.',
  },
];

const onboardingSteps = [
  'Create a Connect Express account for each merchant with the desired payout interval.',
  'Generate an onboarding link (Accounts v2) so the merchant can provide identity and bank details.',
  'Use direct charges (or destination/OBO for buy-rate) to let merchants accept customer payments through your platform and trigger payouts.',
  'Monitor completed onboarding and settlement with Stripe dashboards or API webhooks.',
];

interface LinkContext {
  name: string;
  response: SaasAccountLinkResponse;
}

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-AU', { hour12: false }) : 'Not issued yet';

export default function SaaSPlatform() {
  const [formState, setFormState] = useState({
    businessName: '',
    email: '',
    country: 'US',
    payoutInterval: 'weekly' as CreateSaasMerchantPayload['payoutInterval'],
  });
  const [latestLink, setLatestLink] = useState<LinkContext | null>(null);
  const queryClient = useQueryClient();
  const { data: merchants = [], isFetching } = useQuery<SaasMerchant[]>({
    queryKey: ['saasMerchants'],
    queryFn: fetchSaasMerchants
  });

  const createMerchantMutation = useMutation({
    mutationFn: (payload: CreateSaasMerchantPayload) => createSaasMerchant(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['saasMerchants'] });
      setLatestLink({
        name: result.merchant.name,
        response: {
          onboardingLink: result.onboardingLink,
          onboardingExpiresAt: result.onboardingExpiresAt,
        },
      });
      setFormState((prev) => ({ ...prev, businessName: '', email: '' }));
    },
  });

  const refreshLinkMutation = useMutation({
    mutationFn: (merchantId: number) => refreshSaasAccountLink(merchantId)
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await createMerchantMutation.mutateAsync({
      businessName: formState.businessName,
      email: formState.email,
      country: formState.country,
      payoutInterval: formState.payoutInterval,
    });
  };

  const handleFieldChange =
    (field: keyof typeof formState) =>
      (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = event.target.value;
        setFormState((prev) => ({ ...prev, [field]: value } as typeof prev));
      };

  const handleRefresh = (merchant: SaasMerchant) => {
    setLatestLink({ name: merchant.name, response: { onboardingLink: null, onboardingExpiresAt: null } });
    refreshLinkMutation.mutate(merchant.id, {
      onSuccess: (response) => {
        setLatestLink({ name: merchant.name, response });
      },
    });
  };

  return (
    <div className="bg-brand-navy min-h-screen text-brand-grey py-16 px-4 sm:px-8 lg:px-16">
      <div className="max-w-6xl mx-auto space-y-12">
        <section className="space-y-6">
          <p className="text-sm uppercase tracking-[0.4em] text-brand-gold">SaaS Connect MWE</p>
          <h1 className="text-4xl lg:text-5xl font-serif text-white max-w-3xl">
            Stripe Accounts v2 onboarding sample for your SaaS platform
          </h1>
          <p className="text-lg text-white/80 max-w-3xl">
            This experimental dashboard shows how to register merchant partners, create onboarding links, and
            surface the existing Connect accounts so you can verify payout intervals, bookings, and revenue split
            models before rolling the flow into production.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {monetizationModels.map((model) => (
              <div key={model.title} className="border border-white/10 rounded-2xl p-4 bg-white/5 backdrop-blur">
                <h3 className="text-xl font-semibold text-white">{model.title}</h3>
                <p className="mt-2 text-sm text-white/70 leading-relaxed">{model.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr,1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-brand-gold">Step-by-step pattern</p>
              <h2 className="text-2xl font-semibold text-white mt-2">Platform flow</h2>
            </div>
            <ol className="space-y-3 rounded-2xl border border-white/5 bg-brand-navy/40 p-4 text-sm">
              {onboardingSteps.map((step, index) => (
                <li key={step} className="flex gap-3 text-white/80">
                  <span className="font-mono text-brand-gold">0{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-brand-gold">Onboard a merchant</p>
            <h2 className="text-2xl font-semibold text-white mt-1">Create express account</h2>
            <form onSubmit={handleSubmit} className="space-y-4 mt-6 text-sm">
              <label className="block">
                <span className="text-white/80">Business name</span>
                <input
                  value={formState.businessName}
                  onChange={handleFieldChange('businessName')}
                  placeholder="Maple Fleet L2"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b1520] px-4 py-2 text-white focus:border-brand-gold focus:outline-none"
                  required
                />
              </label>

              <label className="block">
                <span className="text-white/80">Email for Stripe account</span>
                <input
                  value={formState.email}
                  onChange={handleFieldChange('email')}
                  type="email"
                  placeholder="finance@example.com"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b1520] px-4 py-2 text-white focus:border-brand-gold focus:outline-none"
                  required
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-white/80">Country</span>
                  <input
                    value={formState.country}
                    onChange={handleFieldChange('country')}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b1520] px-4 py-2 text-white focus:border-brand-gold focus:outline-none"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-white/80">Payout schedule</span>
                  <select
                    value={formState.payoutInterval}
                    onChange={handleFieldChange('payoutInterval') as () => void}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b1520] px-4 py-2 text-white focus:border-brand-gold focus:outline-none"
                  >
                    {payoutOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-brand-gold py-3 text-xs font-semibold uppercase tracking-[0.3em] text-brand-navy transition hover:brightness-110"
                disabled={createMerchantMutation.isPending}
              >
                {createMerchantMutation.isPending ? 'Creating merchant...' : 'Generate onboarding link'}
              </button>
            </form>
          </div>
        </section>

        {latestLink && (
          <section className="rounded-3xl border border-white/10 bg-brand-navy/50 p-6 space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-brand-gold">Latest onboarding</p>
            <h2 className="text-2xl font-semibold text-white">{latestLink.name}</h2>
            {latestLink.response.onboardingLink ? (
              <a
                target="_blank"
                rel="noreferrer"
                href={latestLink.response.onboardingLink}
                className="inline-flex items-center gap-2 rounded-xl border border-brand-gold/40 bg-brand-gold/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-brand-gold"
              >
                Open onboarding flow
              </a>
            ) : (
              <p className="text-white/80 text-sm">Onboarding link is being refreshed...</p>
            )}
            <p className="text-white/70 text-sm">Expires: {formatDateTime(latestLink.response.onboardingExpiresAt)}</p>
          </section>
        )}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-brand-gold">Connected merchants</p>
              <h2 className="text-2xl font-semibold text-white">Live accounts</h2>
            </div>
            <span className="text-xs text-white/60">{isFetching ? 'Refreshing…' : 'Data from local DB'}</span>
          </div>

          <div className="space-y-4">
            {merchants.length === 0 && (
              <p className="text-sm text-white/60">No merchants registered yet. Create one with the form above.</p>
            )}
            {merchants.map((merchant) => (
              <div
                key={merchant.id}
                className="flex flex-col rounded-2xl border border-white/10 bg-brand-navy/50 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{merchant.name}</p>
                  <p className="text-xs text-white/70">
                    {merchant.email} • {merchant.country} • Payout {merchant.payoutInterval}
                  </p>
                  <p className="text-xs text-white/60">Status: {merchant.onboardingStatus}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 md:mt-0 md:flex-row">
                  <button
                    onClick={() => handleRefresh(merchant)}
                    className="rounded-2xl border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-brand-gold hover:text-brand-gold"
                    disabled={refreshLinkMutation.isPending}
                  >
                    {refreshLinkMutation.isPending ? 'Refreshing…' : 'Get onboarding link'}
                  </button>
                  <span className="text-xs text-white/60">{new Date(merchant.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
