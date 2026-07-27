import { Link } from '../lib/router';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Sparkles,
  Wallet,
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
  name: 'Maple Rentals',
  url: buildCanonicalUrl('/'),
  description:
    'Maple Rentals provides premium driver onboarding, reviewed approvals, and secure Stripe payment workflows for professional drivers across Sydney.',
  telephone: '+61 420 550 556',
  email: 'admin@maplerentals.com.au',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '13/27-33 Addlestone Rd',
    addressLocality: 'Merrylands',
    addressRegion: 'NSW',
    postalCode: '2160',
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
    height: 600,
    image: '/camry-deep-blue-800.webp',
    imageSmall: '/camry-deep-blue-480.webp',
    title: 'Deep blue 2026 Toyota Camry',
    width: 800,
    body: 'A generic Camry colour visual for presentation only. Vehicle / Number Plate is confirmed manually after review.',
  },
  {
    height: 600,
    image: '/camry-pearl-white-800.webp',
    imageSmall: '/camry-pearl-white-480.webp',
    title: 'Pearl white 2026 Toyota Camry',
    width: 800,
    body: 'Maple Rentals records the approved vehicle and number plate as text instead of public fleet selection.',
  },
  {
    height: 600,
    image: '/camry-red-800.webp',
    imageSmall: '/camry-red-480.webp',
    title: 'Red 2026 Toyota Camry',
    width: 800,
    body: 'Stripe checkout stays tied to the approved application and weekly payment, not a catalogue image.',
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
    body: 'Submit your documents, start date, and driver details through Maple Rentals.',
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
    body: 'After successful payment, Maple Rentals finalises onboarding, scheduling, and operational handover.',
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
    <div className="min-h-screen bg-[#0c0a09] text-white selection:bg-brand-gold selection:text-black">
      <Seo
        title="Premium Driver Car Rentals Sydney | Maple Rentals"
        description="Apply with Maple Rentals for a premium, admin-reviewed driver rental program in Sydney with secure Stripe payments and structured onboarding."
        canonicalPath="/"
        keywords={[
          'driver car rentals sydney',
          'uber rental approval sydney',
          'weekly driver rental sydney',
          'stripe car rental payment sydney',
          'maple rentals sydney',
        ]}
        jsonLd={homeJsonLd}
      />

      <section className="relative overflow-hidden border-b border-white/10 bg-[#120f0d]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.16),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(245,158,11,0.12),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-16 px-6 pb-24 pt-32 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-32 lg:pt-36">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-3xl">
            <motion.p variants={fadeUp} className="mb-5 text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">
              Driver Onboarding, Properly Managed
            </motion.p>
            <motion.h1 variants={fadeUp} className="max-w-4xl text-5xl font-serif font-bold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Premium driver rentals with admin-reviewed approvals and secure Stripe payments.
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-8 max-w-2xl text-lg font-light leading-8 text-stone-300">
              Maple Rentals is built for drivers who want a legitimate process. Apply once,
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
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#1b1713] shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
              <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src="/camry-deep-blue-960.webp"
                    srcSet="/camry-deep-blue-640.webp 640w, /camry-deep-blue-960.webp 960w, /camry-deep-blue-1200.webp 1200w"
                    sizes="(min-width: 1280px) 519px, (min-width: 1024px) calc(45vw - 58px), calc(100vw - 48px)"
                    alt="Deep blue generic 2026 Toyota Camry"
                    decoding="async"
                    fetchPriority="high"
                    height={718}
                    width={960}
                    className="h-full w-full object-cover"
                  />
              </div>
              <div className="space-y-5 p-7">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">
                    Payment Confidence
                  </p>
                  <ShieldCheck className="h-5 w-5 text-brand-gold" />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Structured before checkout, secure at checkout, managed after checkout.
                </h2>
                <div className="grid gap-3 text-sm text-stone-300">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                    Payment is requested only after approval and quote review.
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                    Stripe handles the approved weekly rental subscription securely.
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                    Bond is recorded manually for the agreement and handled by Maple Rentals.
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

      <section className="border-b border-white/10 bg-[#0f0d0c] py-20">
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
                className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-7"
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

      <section className="border-b border-white/10 bg-[#16110e] py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold">How It Works</p>
              <h2 className="mt-5 text-4xl font-serif font-bold text-white sm:text-5xl">
                A tighter process from first application to final onboarding.
              </h2>
              <p className="mt-6 max-w-xl text-lg font-light leading-8 text-stone-300">
                This is not a public inventory marketplace. Maple Rentals keeps the process controlled,
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
                  className="rounded-[1.75rem] border border-white/10 bg-[#1d1713] p-6"
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

      <section className="border-b border-white/10 bg-[#0f0d0c] py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold">Stripe and Payments</p>
            <h2 className="mt-5 text-4xl font-serif font-bold text-white sm:text-5xl">
              Payment clarity is built into the experience.
            </h2>
            <p className="mt-6 text-lg font-light leading-8 text-stone-300">
              Drivers should never have to guess when they are paying or why. Maple Rentals keeps the payment
              step separate from the application review so approved pricing is clear before checkout opens.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {[
              {
                icon: Wallet,
                title: 'Before payment',
                body: 'Your application is reviewed first. Maple Rentals confirms the approved vehicle, bond, and weekly amount before any checkout link is issued.',
              },
              {
                icon: CreditCard,
                title: 'At payment',
                body: 'The Stripe session collects the approved weekly rental subscription securely. Bond is recorded separately and handled manually by Maple Rentals.',
              },
              {
                icon: Sparkles,
                title: 'After payment',
                body: 'Once Stripe confirms payment, Maple Rentals moves you into onboarding, scheduling, and operational handover with clear follow-up.',
              },
            ].map((item) => (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-7"
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold/10 text-brand-gold">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-2xl font-serif font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-stone-300">{item.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#17110d] py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold">Vehicle Visuals</p>
            <h2 className="mt-5 text-4xl font-serif font-bold text-white sm:text-5xl">
              Generic 2026 Toyota Camry colours without public fleet selection.
            </h2>
            <p className="mt-6 text-lg font-light leading-8 text-stone-300">
              Maple Rentals keeps the site visual and premium while avoiding number-plate-specific
              fleet photos. Actual Vehicle / Number Plate details are entered manually by admin
              after review.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {showcaseVehicles.map((vehicle, index) => (
              <motion.article
                key={`${vehicle.title}-${index}`}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[#221a15]"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={vehicle.image}
                    srcSet={`${vehicle.imageSmall} 480w, ${vehicle.image} 800w`}
                    sizes="(min-width: 1280px) 384px, (min-width: 1024px) calc((100vw - 128px) / 3), (min-width: 768px) calc((100vw - 112px) / 3), calc(100vw - 48px)"
                    alt={vehicle.title}
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                    decoding="async"
                    height={vehicle.height}
                    loading="lazy"
                    width={vehicle.width}
                  />
                </div>
                <div className="p-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">
                    Maple Rentals
                  </p>
                  <h3 className="mt-3 text-2xl font-serif font-bold text-white">{vehicle.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-stone-300">{vehicle.body}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0d0b0a] py-24">
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
                  Maple Rentals is designed for real driver onboarding, real admin control, and clear Stripe-backed payment handling.
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

      <section className="bg-[#0c0a09] pb-28">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <DeferredInquiryForm />
        </div>
      </section>
    </div>
  );
}
