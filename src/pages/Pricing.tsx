import { Link } from 'react-router-dom';
import { ArrowRight, Check, CreditCard, ShieldCheck, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { rentalPlans } from '../lib/rentalPlans';

export default function Pricing() {
  return (
    <div className="min-h-screen bg-[#F4F6F8] text-brand-navy selection:bg-brand-gold selection:text-black">
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
            Pricing built for professional drivers.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-slate-300 text-lg max-w-3xl mx-auto font-light leading-relaxed"
          >
            These plan tiers were merged from the replica app into the main project so drivers can compare commitment levels before choosing a vehicle. Final availability and checkout still happen through the main fleet and application flow.
          </motion.p>
        </div>
      </section>

      <section className="py-20 md:py-24 px-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
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
                <p className={`text-[10px] font-bold uppercase tracking-[0.35em] mb-4 ${plan.popular ? 'text-brand-gold' : 'text-slate-400'}`}>{plan.highlight}</p>
                <h2 className="text-3xl font-serif font-bold mb-3">{plan.name}</h2>
                <p className={`text-sm leading-relaxed mb-8 ${plan.popular ? 'text-slate-300' : 'text-slate-500'}`}>{plan.description}</p>

                <div className="mb-8">
                  <div className="flex items-end gap-2">
                    <span className={`text-5xl font-bold ${plan.popular ? 'text-brand-gold' : 'text-brand-navy'}`}>${plan.priceAud}</span>
                    <span className={`text-xs uppercase tracking-[0.22em] mb-2 ${plan.popular ? 'text-slate-300' : 'text-slate-400'}`}>{plan.cadence}</span>
                  </div>
                </div>

                <ul className="space-y-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <Check className={`w-4 h-4 mt-0.5 ${plan.popular ? 'text-brand-gold' : 'text-brand-navy'}`} />
                      <span className={plan.popular ? 'text-slate-200' : 'text-slate-600'}>{feature}</span>
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
                  to="/cars"
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] transition-colors ${plan.popular ? 'border-white/15 text-white hover:border-white/40' : 'border-slate-200 text-brand-navy hover:border-brand-navy/25'}`}
                >
                  Browse Fleet
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: ShieldCheck,
              title: 'Protected payments',
              body: 'Stripe powers the payment flow once your application and vehicle allocation are confirmed.',
            },
            {
              icon: CreditCard,
              title: 'Transparent onboarding costs',
              body: 'Upfront and recurring charges remain visible in the main checkout flow before you pay.',
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

