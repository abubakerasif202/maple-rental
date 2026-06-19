import { Link } from 'react-router-dom';
import { ChevronRight, HelpCircle, ShieldCheck, Clock3, BadgeInfo } from 'lucide-react';
import Seo from '../components/Seo';

const faqs = [
  {
    q: 'What documents do I need to apply?',
    a: 'You need a valid Australian licence, proof of address, and standard identity details. Extra documents may be requested during review if the file set is incomplete.',
  },
  {
    q: 'When do payments start?',
    a: 'Payments only begin after an approved application is reviewed by the Gala team and the secure Stripe checkout link is issued.',
  },
  {
    q: 'Can the subscription start date be controlled by admin?',
    a: 'Yes. The admin sets the rental subscription start date during approval. Same-day or past dates activate immediately, while future dates are handled through Stripe-safe scheduling.',
  },
  {
    q: 'What about tolls and notices?',
    a: 'Operational notices are recorded in the admin dashboard and can be generated into PDF documents for follow-up work, including toll-related notices where required.',
  },
  {
    q: 'Can I cancel my application?',
    a: 'Yes. Unpaid applications can be cancelled by the admin. Once payment is active, cancellation follows the rental and subscription rules in the agreement.',
  },
  {
    q: 'Do you hide fees?',
    a: 'No. The pricing page shows the current weekly plan, bond, and how the subscription works before checkout is opened.',
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-brand-navy text-white">
      <Seo
        title="FAQ | Gala Rentals"
        description="Answers to common questions about documents, payments, insurance, notices, cancellations, and rental start dates."
        canonicalPath="/faq"
      />

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(223,177,37,0.16),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.06),transparent_24%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">Questions</p>
            <h1 className="mt-5 text-5xl font-serif font-bold tracking-tight sm:text-6xl">
              Common questions, answered clearly.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-300">
              Gala Rentals keeps the process transparent from application through payment,
              notices, and rental handover.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          {faqs.map((item) => (
            <article key={item.q} className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-gold/20 bg-brand-gold/10 text-brand-gold">
                <HelpCircle className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-semibold text-white">{item.q}</h2>
              <p className="mt-3 text-sm leading-7 text-brand-grey">{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#071120]">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-3 lg:px-8">
          {[
            {
              icon: ShieldCheck,
              title: 'Review first',
              body: 'Applications are validated before payment links are sent.',
            },
            {
              icon: Clock3,
              title: 'Start date control',
              body: 'Admin-selected rental dates are stored in the database.',
            },
            {
              icon: BadgeInfo,
              title: 'Operational records',
              body: 'Documents and notices stay searchable in the admin dashboard.',
            },
          ].map((item) => (
            <article key={item.title} className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gold/10 text-brand-gold">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-7 text-brand-grey">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0b1a2d]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold">Next step</p>
            <h2 className="mt-4 text-3xl font-serif font-bold text-white">Ready to apply?</h2>
          </div>
          <Link
            to="/apply"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-7 py-4 text-xs font-bold uppercase tracking-[0.24em] text-brand-navy transition-colors hover:bg-brand-gold-light"
          >
            Start Application <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
