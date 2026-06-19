import { CalendarDays, ShieldCheck, Wallet, MessageSquareText, CarFront } from 'lucide-react';
import Seo from '../components/Seo';

const items = [
  {
    icon: CarFront,
    title: 'Approved vehicle',
    value: 'Gala selected fleet vehicle',
  },
  {
    icon: CalendarDays,
    title: 'Subscription start',
    value: 'Managed by admin on approval',
  },
  {
    icon: Wallet,
    title: 'Weekly payment',
    value: 'Visible after approval',
  },
  {
    icon: ShieldCheck,
    title: 'Insurance status',
    value: 'Covered under rental program rules',
  },
];

export default function MyRental() {
  return (
    <div className="min-h-screen bg-brand-navy text-white">
      <Seo
        title="My Rental | Gala Rentals"
        description="Mobile-style customer portal for Gala Rentals with rental status, support links, and key subscription information."
        canonicalPath="/my-rental"
        robots="noindex,nofollow"
      />

      <section className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#0f243e] to-[#071120] shadow-[0_28px_90px_rgba(0,0,0,0.35)]">
          <div className="px-6 pt-6">
            <div className="rounded-[1.5rem] border border-brand-gold/15 bg-white/[0.04] px-5 py-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">Customer portal</p>
              <h1 className="mt-3 text-3xl font-serif font-bold tracking-tight">My Rental</h1>
              <p className="mt-2 text-sm leading-7 text-brand-grey">
                Check the current rental state, support details, and subscription notes from a mobile-style view.
              </p>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <article key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-gold/10 text-brand-gold">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">{item.title}</p>
                  <p className="mt-2 text-sm text-white">{item.value}</p>
                </article>
              ))}
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">Support</p>
              <div className="mt-3 space-y-3 text-sm text-brand-grey">
                <p>Need help with tolls, documents, or billing?</p>
                <p>Use the contact page for support or ask the admin team to update your record.</p>
              </div>
              <div className="mt-5 flex gap-3">
                <a
                  href="/contact"
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-brand-gold px-5 py-3 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-navy"
                >
                  Contact
                </a>
                <a
                  href="/faq"
                  className="inline-flex flex-1 items-center justify-center rounded-full border border-white/10 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.24em] text-white"
                >
                  FAQ
                </a>
              </div>
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-[#091a2f] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">Next actions</p>
              <ul className="mt-3 space-y-3 text-sm leading-7 text-brand-grey">
                <li>1. Wait for admin review and approved pricing.</li>
                <li>2. Complete the Stripe checkout link when issued.</li>
                <li>3. Keep your documents ready for any follow-up.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
