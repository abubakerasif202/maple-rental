import { Link } from 'react-router-dom';
import { ArrowRight, Check, ShieldCheck, Star, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import Seo from '../components/Seo';
import { fetchRentalPlans } from '../lib/api';

export default function Pricing() {
  const {
    data: rentalPlans = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['rental-plans'],
    queryFn: fetchRentalPlans,
  });

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-brand-navy selection:bg-brand-gold selection:text-black">
      <Seo
        title="Pricing | Gala Rentals"
        description="Compare Gala Rentals weekly plans, bond requirements, and subscription structure before you apply."
        canonicalPath="/pricing"
        keywords={[
          'car rental plans sydney',
          'weekly car rental sydney',
          'uber rental plans sydney',
          'merrylands car rental plans',
          'parramatta car rental plans',
        ]}
      />

      <section className="bg-brand-navy py-24 md:py-28 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-[10px] font-bold tracking-[0.45em] uppercase text-brand-gold mb-4"
          >
            Flexible Plans
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl md:text-6xl font-serif font-bold text-white mb-6"
          >
            Sydney rental plans built for professional drivers.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-slate-300 text-lg max-w-3xl mx-auto font-light leading-relaxed"
          >
            Compare each plan&apos;s billing cadence, support level, and included services before
            you apply. Gala Rentals confirms the approved vehicle, weekly amount, and payment
            step only after review.
          </motion.p>
        </div>
      </section>

      <section className="py-20 md:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          {isLoading && (
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
              <Loader2 className="w-8 h-8 animate-spin text-brand-gold mx-auto mb-4" />
              <p className="text-sm uppercase tracking-[0.2em] font-bold text-slate-500">
                Loading plan options
              </p>
            </div>
          )}

          {isError && (
            <div className="rounded-3xl border border-red-200 bg-white px-6 py-16 text-center shadow-sm">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-4" />
              <p className="text-sm uppercase tracking-[0.2em] font-bold text-red-500 mb-3">
                Plans unavailable
              </p>
              <p className="text-slate-600 mb-6">
                We could not load the current rental plan summaries. Try again shortly or continue
                with the standard application flow.
              </p>
              <Link
                to="/apply"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-navy px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-brand-navy-light"
              >
                Start Application <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {!isLoading && !isError && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {rentalPlans.map((plan, index) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                  className={`relative rounded-3xl border overflow-hidden flex flex-col ${plan.popular ? 'bg-brand-navy text-white border-brand-gold/50 shadow-[0_25px_70px_rgba(0,35,71,0.22)]' : 'bg-white text-brand-navy border-slate-200 shadow-sm'}`}
                >
                  {plan.popular && (
                    <div className="absolute top-5 right-5 flex items-center gap-1 rounded-full bg-brand-gold px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy">
                      <Star className="w-3 h-3 fill-current" />
                      Most Popular
                    </div>
                  )}

                  <div className="p-8 flex-1">
                    <p className={`text-[10px] font-bold uppercase tracking-[0.35em] mb-4 ${plan.popular ? 'text-brand-gold' : 'text-slate-400'}`}>
                      {plan.highlight}
                    </p>
                    <h2 className="text-3xl font-serif font-bold mb-3">{plan.name}</h2>
                    <p className={`text-sm leading-relaxed mb-8 ${plan.popular ? 'text-slate-300' : 'text-slate-500'}`}>
                      {plan.description}
                    </p>

                    <div className={`rounded-2xl border p-4 mb-8 ${plan.popular ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-2 ${plan.popular ? 'text-slate-400' : 'text-slate-500'}`}>
                        Billing cadence
                      </p>
                      <p className="text-2xl font-bold">{plan.cadenceLabel}</p>
                      <p className={`mt-3 text-sm leading-7 ${plan.popular ? 'text-slate-300' : 'text-slate-600'}`}>
                        Exact pricing and vehicle details are shared privately by Gala Rentals
                        after your application is approved.
                      </p>
                    </div>

                    <ul className="space-y-4">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm">
                          <Check className={`w-4 h-4 mt-0.5 ${plan.popular ? 'text-brand-gold' : 'text-brand-navy'}`} />
                          <span className={plan.popular ? 'text-slate-200' : 'text-slate-600'}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-8 pt-0 space-y-3">
                    <Link
                      to="/apply"
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] transition-colors ${plan.popular ? 'bg-brand-gold text-brand-navy hover:bg-brand-gold-light' : 'bg-brand-navy text-white hover:bg-brand-navy-light'}`}
                    >
                      Start Application <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      to="/"
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] transition-colors ${plan.popular ? 'border-white/15 text-white hover:border-white/40' : 'border-slate-200 text-brand-navy hover:border-brand-navy/25'}`}
                    >
                      Back to Home
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: ShieldCheck,
              title: 'Protected payments',
              body: 'Stripe checkout opens only after your application is reviewed and the approved quote is confirmed.',
            },
            {
              icon: Check,
              title: 'Review-first approval',
              body: 'Gala Rentals confirms the approved vehicle, onboarding notes, and exact billing amount during review.',
            },
            {
              icon: Check,
              title: 'Designed for active drivers',
              body: 'Insurance, maintenance cadence, and support expectations are built into every tier.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold">
                <item.icon className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-serif font-bold text-brand-navy mb-3">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
