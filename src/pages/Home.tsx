import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  FileText,
  KeyRound,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { motion, type Variants } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import DeferredInquiryForm from '../components/DeferredInquiryForm';
import Seo from '../components/Seo';
import { fetchRentalPlans } from '../lib/api';
import { buildCanonicalUrl } from '../lib/seo';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' } },
};

const stagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const homeJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Gala Rentals',
  url: buildCanonicalUrl('/'),
  description:
    'Gala Rentals provides premium vehicle subscriptions, reviewed approvals, and secure Stripe payment workflows across Sydney.',
  telephone: '+61 1300 555 828',
  email: 'hello@galarentals.com.au',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Sydney service hub',
    addressLocality: 'Sydney',
    addressRegion: 'NSW',
    postalCode: '2000',
    addressCountry: 'AU',
  },
  areaServed: [
    { '@type': 'City', name: 'Sydney' },
    { '@type': 'City', name: 'Parramatta' },
    { '@type': 'City', name: 'Merrylands' },
  ],
};

const showcaseVehicles = [
  {
    image: '/car-images/CNO40S.jpeg',
    title: 'Toyota Camry Hybrid',
    body: 'Executive-grade hybrid sedan with weekly rental structure, bond review, and handover support.',
    price: 'From $390/wk',
    tag: 'Hybrid sedan',
  },
  {
    image: '/car-images/YNU55M.jpeg',
    title: 'Kia Carnival',
    body: 'Premium people mover option for high-capacity work, approved through Gala operations.',
    price: 'From $520/wk',
    tag: 'People mover',
  },
  {
    image: '/car-images/YPB83A.jpeg',
    title: 'SUV Collection',
    body: 'Comfortable, airport-ready SUVs with clear weekly pricing and secure checkout after approval.',
    price: 'From $470/wk',
    tag: 'SUV range',
  },
];

const trustPoints = [
  {
    icon: ShieldCheck,
    title: 'Admin-reviewed approvals',
    body: 'Every driver application is reviewed before any payment request is sent.',
  },
  {
    icon: CreditCard,
    title: 'Stripe-hosted checkout',
    body: 'Payment happens through a secure Stripe session with approved amounts already confirmed.',
  },
  {
    icon: BadgeCheck,
    title: 'Clear onboarding path',
    body: 'Drivers know what happens before payment, at payment, and after payment.',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Apply as a driver',
    body: 'Submit your documents, start date, and driver details through Gala Rentals.',
  },
  {
    step: '02',
    title: 'Admin review and approval',
    body: 'The team reviews your application, approves the vehicle and pricing, and confirms the next step.',
  },
  {
    step: '03',
    title: 'Secure Stripe payment',
    body: 'You receive a time-limited Stripe checkout link only after approval is complete.',
  },
  {
    step: '04',
    title: 'Onboarding and handover',
    body: 'After successful payment, Gala Rentals finalises onboarding, scheduling, and operational handover.',
  },
];

export default function Home() {
  const {
    data: rentalPlans = [],
  } = useQuery({
    queryKey: ['rental-plans'],
    queryFn: fetchRentalPlans,
  });

  const popularPlan = rentalPlans.find((plan) => plan.popular) ?? rentalPlans[0] ?? null;

  return (
    <div className="min-h-screen bg-[#061425] text-white selection:bg-brand-gold selection:text-black">
      <Seo
        title="Gala Rentals | Premium Car Subscriptions Sydney"
        description="Apply with Gala Rentals for a premium, admin-reviewed vehicle subscription program in Sydney with secure Stripe payments and structured onboarding."
        canonicalPath="/"
        keywords={[
          'driver car rentals sydney',
          'uber rental approval sydney',
          'weekly driver rental sydney',
          'stripe car rental payment sydney',
          'gala rentals sydney',
        ]}
        jsonLd={homeJsonLd}
      />

      <section className="relative overflow-hidden border-b border-white/10 bg-[#061425]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(223,177,37,0.18),transparent_31%),linear-gradient(120deg,rgba(11,31,54,0.96),rgba(6,20,37,0.88)_52%,rgba(3,10,20,0.98))]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#061425] to-transparent" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-16 px-6 pb-24 pt-32 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-32 lg:pt-36">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-3xl">
            <motion.p variants={fadeUp} className="mb-5 text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">
              Driver Onboarding, Properly Managed
            </motion.p>
            <motion.h1 variants={fadeUp} className="max-w-4xl text-5xl font-serif font-bold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Premium driver rentals with admin-reviewed approvals and secure Stripe payments.
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-8 max-w-2xl text-lg font-light leading-8 text-stone-300">
              Gala Rentals is built for drivers who want a premium process. Apply once,
              get reviewed by the team, receive a confirmed quote, and pay only when your
              approval is ready.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                to="/apply"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-brand-navy transition-colors hover:bg-brand-gold-light"
              >
                Start Driver Application <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white transition-colors hover:border-brand-gold hover:text-brand-gold"
              >
                Review Plans
              </Link>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-12 flex flex-wrap gap-3">
              {['Application review before payment', 'Secure Stripe checkout', 'Admin-controlled onboarding'].map((item) => (
                <div
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-gold" />
                  {item}
                </div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="grid gap-6"
          >
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1f36] shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="/car-images/CNO40S.jpeg"
                  alt="Premium Gala Rentals vehicle"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="grid gap-5 p-7 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">
                      Approval Ready
                    </p>
                    <ShieldCheck className="h-5 w-5 text-brand-gold" />
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-white">
                    Premium rentals, approved before payment.
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Drivers apply with documents, Gala reviews the profile, then a secure checkout opens with confirmed pricing.
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-5 text-brand-navy shadow-2xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.26em] text-brand-gold-dark">
                    Quick Application
                  </p>
                  <div className="mt-4 grid gap-3">
                    {['Full name', 'Licence state', 'Preferred vehicle'].map((field) => (
                      <div key={field} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                        {field}
                      </div>
                    ))}
                    <Link
                      to="/apply"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-brand-navy"
                    >
                      Apply <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {popularPlan && (
              <div className="rounded-[2rem] border border-brand-gold/20 bg-gradient-to-br from-brand-gold/10 to-transparent p-7">
                <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">
                  Plan Snapshot
                </p>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-serif font-bold text-white">{popularPlan.name}</h3>
                    <p className="mt-2 max-w-md text-sm leading-7 text-stone-300">
                      {popularPlan.description}
                    </p>
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-gold">
                    {popularPlan.cadenceLabel}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0b1f36] py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="grid gap-6 md:grid-cols-3"
          >
            {trustPoints.map((item) => (
              <motion.article
                key={item.title}
                variants={fadeUp}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold/10 text-brand-gold">
                  <item.icon className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-serif font-bold text-white">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-stone-300">{item.body}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#061425] py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold">How It Works</p>
              <h2 className="mt-5 text-4xl font-serif font-bold text-white sm:text-5xl">
                A tighter process from first application to final onboarding.
              </h2>
              <p className="mt-6 max-w-xl text-lg font-light leading-8 text-stone-300">
                This is not a public inventory marketplace. Gala Rentals keeps the process controlled,
                clear, and professional so drivers know exactly when review ends and payment begins.
              </p>
            </motion.div>

            <div className="grid gap-5">
              {howItWorks.map((item) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, x: 18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="rounded-2xl border border-white/10 bg-[#0b1f36] p-6"
                >
                  <div className="flex items-start gap-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-gold text-[12px] font-bold tracking-[0.2em] text-brand-navy">
                      {item.step}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-stone-300">{item.body}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0b1f36] py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[1fr_0.82fr] lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold">Mobile Rental Portal</p>
            <h2 className="mt-5 text-4xl font-serif font-bold text-white sm:text-5xl">
              A driver portal preview for application, checkout, and handover status.
            </h2>
            <p className="mt-6 max-w-2xl text-lg font-light leading-8 text-slate-300">
              The mobile experience keeps the rental journey visible: documents submitted, admin review,
              checkout ready, and vehicle handover scheduled.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { icon: FileText, label: 'Documents', value: 'Submitted' },
                { icon: CreditCard, label: 'Checkout', value: 'Secure' },
                { icon: KeyRound, label: 'Handover', value: 'Scheduled' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <item.icon className="h-5 w-5 text-brand-gold" />
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="mx-auto w-full max-w-sm"
          >
            <div className="rounded-[2.4rem] border border-brand-gold/30 bg-[#020817] p-3 shadow-[0_32px_100px_rgba(0,0,0,0.45)]">
              <div className="overflow-hidden rounded-[2rem] bg-white text-brand-navy">
                <div className="bg-brand-navy px-6 pb-8 pt-6 text-white">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold">My Rental</p>
                    <Smartphone className="h-5 w-5 text-brand-gold" />
                  </div>
                  <h3 className="mt-8 text-2xl font-serif font-bold">Camry Hybrid</h3>
                  <p className="mt-2 text-sm text-slate-300">Application approved. Checkout link active.</p>
                </div>
                <div className="space-y-4 p-6">
                  {['Profile reviewed', 'Payment link issued', 'Pickup window pending'].map((item, index) => (
                    <div key={item} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${index < 2 ? 'bg-brand-gold text-brand-navy' : 'bg-slate-200 text-slate-500'}`}>
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-bold">{item}</span>
                    </div>
                  ))}
                  <Link to="/my-rental" className="flex items-center justify-center rounded-2xl bg-brand-gold px-5 py-4 text-xs font-black uppercase tracking-[0.2em] text-brand-navy">
                    Open Portal
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#f8fafc] py-24 text-brand-navy">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold-dark">Premium Fleet</p>
            <h2 className="mt-5 text-4xl font-serif font-bold text-brand-navy sm:text-5xl">
              Premium fleet cards with clear pricing signals and approval-first checkout.
            </h2>
            <p className="mt-6 text-lg font-light leading-8 text-slate-600">
              Gala Rentals uses real vehicle imagery to show standards and presentation while keeping assignment,
              pricing, and operational control inside the approval workflow.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {showcaseVehicles.map((vehicle, index) => (
              <motion.article
                key={vehicle.image}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={vehicle.image}
                    alt={vehicle.title}
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="rounded-full bg-brand-gold/15 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-brand-gold-dark">
                      {vehicle.tag}
                    </p>
                    <p className="text-sm font-black text-brand-navy">{vehicle.price}</p>
                  </div>
                  <h3 className="mt-5 text-2xl font-serif font-bold text-brand-navy">{vehicle.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{vehicle.body}</p>
                  <Link to="/fleet" className="mt-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-brand-gold-dark">
                    View fleet <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#061425] py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <div className="rounded-[2.25rem] border border-brand-gold/20 bg-gradient-to-br from-brand-gold/10 via-white/[0.03] to-transparent px-8 py-10 sm:px-10 sm:py-12">
            <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold">
                  Start With Confidence
                </p>
                <h2 className="mt-5 text-4xl font-serif font-bold text-white sm:text-5xl">
                  Apply once. Get reviewed properly. Pay only when everything is ready.
                </h2>
                <p className="mt-6 max-w-2xl text-lg font-light leading-8 text-stone-300">
                  Gala Rentals is designed for real driver onboarding, real admin control, and clear Stripe-backed payment handling.
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <Link
                  to="/apply"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-brand-navy transition-colors hover:bg-brand-gold-light"
                >
                  Apply Now <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white transition-colors hover:border-brand-gold hover:text-brand-gold"
                >
                  View Rental Plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#061425] pb-28">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <DeferredInquiryForm />
        </div>
      </section>
    </div>
  );
}
