import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Check, Wrench, Fuel, Sparkles } from 'lucide-react';
import { motion, Variants } from 'motion/react';
import InquiryForm from '../components/InquiryForm';
import { rentalPlans } from '../lib/rentalPlans';

const fadeIn: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: 'easeOut' } },
};

const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: 'easeOut' } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

export default function Home() {
  return (
    <div className="bg-white text-brand-navy min-h-screen font-sans selection:bg-brand-gold selection:text-black">
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden bg-[#F8F9FA]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(197,160,40,0.18),transparent_32%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="text-left"
            >
              <motion.p variants={fadeIn} className="text-[10px] font-bold tracking-[0.4em] uppercase text-brand-gold mb-4">
                Premium Hybrid Fleet
              </motion.p>
              <motion.h1 variants={fadeIn} className="text-5xl lg:text-7xl font-serif font-bold tracking-tight mb-8 leading-[1.05] text-brand-navy">
                Premium Hybrid Fleet for Professional Drivers.
              </motion.h1>
              <motion.p variants={fadeIn} className="text-lg text-slate-600 mb-10 max-w-lg font-light leading-relaxed">
                Drive with confidence in meticulously maintained Toyota Camry Hybrids. Reliable, efficient, and Uber-compliant, designed to maximize your weekly earnings.
              </motion.p>

              <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 mb-10">
                <Link
                  to="/apply"
                  className="bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-10 py-4 font-bold text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                >
                  Apply Now <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/pricing"
                  className="border border-brand-navy/15 hover:border-brand-navy bg-white text-brand-navy px-10 py-4 font-bold text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  View Plans
                </Link>
              </motion.div>

              <motion.div variants={fadeIn} className="flex flex-wrap items-center gap-6 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-brand-gold" /> Fully insured</span>
                <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-gold" /> Professionally detailed</span>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <div className="absolute -inset-6 bg-brand-gold/10 blur-3xl" />
              <img
                src="/hero-camry.webp"
                alt="Toyota Camry Hybrid"
                className="w-full h-auto object-cover relative z-10 rounded-3xl shadow-[0_30px_80px_rgba(0,35,71,0.18)]"
              />
            </motion.div>
          </div>
        </div>
      </section>

      <section className="pb-32 bg-[#F8F9FA] relative z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <InquiryForm />
        </div>
      </section>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="border-y border-white/10 bg-brand-navy-light"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-[10px] md:text-xs font-bold text-brand-gold uppercase tracking-[0.4em]">
            Serving Professional Uber Drivers Across Sydney
          </p>
        </div>
      </motion.div>

      <section className="py-32 bg-brand-navy relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#D4AF37 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={slideInLeft}>
              <h2 className="text-4xl md:text-6xl font-serif font-bold mb-10 tracking-tight leading-tight text-white">
                Not Just a Rental.<br />A Business Tool.
              </h2>
              <div className="space-y-6 text-slate-400 text-lg font-light leading-relaxed max-w-xl">
                <p>
                  Maple Rentals provides professionally maintained Toyota Camry Hybrid vehicles designed for long hours, lower fuel costs, and reliable performance.
                </p>
                <p>
                  We keep your car running smoothly so you can focus on earning. Our fleet is maintained to reduce downtime and preserve your weekly income.
                </p>
              </div>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="space-y-6">
              {[
                {
                  icon: Wrench,
                  title: 'Professional Maintenance',
                  body: 'Every vehicle is serviced and inspected to keep you earning consistently.',
                },
                {
                  icon: Fuel,
                  title: 'Hybrid Efficiency',
                  body: 'Lower your weekly fuel costs with a fleet optimized for long shifts across Sydney.',
                },
              ].map((item) => (
                <motion.div key={item.title} variants={fadeIn} className="bg-brand-navy-light p-8 border border-brand-gold/30 flex items-start gap-6 group hover:bg-brand-navy transition-colors">
                  <div className="bg-brand-gold/10 p-4 rounded-lg">
                    <item.icon className="w-8 h-8 text-brand-gold" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2 tracking-wide">{item.title}</h3>
                    <p className="text-slate-400 text-sm font-light leading-relaxed">{item.body}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className="mb-20">
            <h2 className="text-4xl md:text-6xl font-serif font-bold tracking-tight text-brand-navy mb-6">Start Driving in 3 Steps</h2>
            <p className="text-slate-600 text-lg font-light">Maximize your weekly returns with our exclusive and reliable fleet.</p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { step: '01', title: 'Apply Online', desc: 'Submit your driver details and required documents through our secure portal.' },
              { step: '02', title: 'Get Approved', desc: 'Our team verifies your information and prepares your vehicle within 24 hours.' },
              { step: '03', title: 'Collect & Start Earning', desc: 'Pick up your keys, connect to the Uber app, and start earning immediately.' },
            ].map((item) => (
              <motion.div key={item.step} variants={fadeIn} className="flex flex-col items-center">
                <div className="w-16 h-16 bg-brand-navy text-brand-gold flex items-center justify-center text-xl font-bold mb-8 rounded-full">
                  {item.step}
                </div>
                <h3 className="text-2xl font-bold text-brand-navy mb-4">{item.title}</h3>
                <p className="text-slate-600 font-light text-sm leading-relaxed max-w-xs">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-28 bg-[#F4F6F8] border-y border-slate-200/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-14">
            <div>
              <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-brand-gold mb-4">Flexible Plans</p>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-brand-navy mb-4">Choose the cadence that fits your driving schedule.</h2>
              <p className="text-slate-600 max-w-2xl text-lg font-light leading-relaxed">
                We merged the replica plan merchandising into the main app here so drivers can compare tiers before choosing a vehicle or starting an application.
              </p>
            </div>
            <Link to="/pricing" className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-brand-navy hover:text-brand-gold transition-colors">
              Explore all plans <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {rentalPlans.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className={`rounded-3xl border p-8 shadow-sm ${plan.popular ? 'bg-brand-navy text-white border-brand-gold/50 shadow-[0_25px_60px_rgba(0,35,71,0.2)]' : 'bg-white text-brand-navy border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-4 mb-8">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.3em] mb-3 ${plan.popular ? 'text-brand-gold' : 'text-slate-400'}`}>
                      {plan.highlight}
                    </p>
                    <h3 className="text-2xl font-serif font-bold mb-2">{plan.name}</h3>
                    <p className={`text-sm leading-relaxed ${plan.popular ? 'text-slate-300' : 'text-slate-500'}`}>{plan.description}</p>
                  </div>
                  {plan.popular && <span className="rounded-full border border-brand-gold/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">Popular</span>}
                </div>

                <div className="mb-8">
                  <div className="flex items-end gap-2">
                    <span className={`text-5xl font-bold ${plan.popular ? 'text-brand-gold' : 'text-brand-navy'}`}>${plan.priceAud}</span>
                    <span className={`text-xs uppercase tracking-[0.2em] mb-2 ${plan.popular ? 'text-slate-300' : 'text-slate-400'}`}>{plan.cadence}</span>
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 bg-brand-navy relative overflow-hidden border-t border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.05)_0%,transparent_70%)]"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className="text-left">
              <h2 className="text-4xl md:text-6xl font-serif font-bold mb-8 leading-tight text-white">Ready to Drive with Sydney's Most Reliable Fleet?</h2>
              <p className="text-xl text-slate-400 mb-12 font-light">Join drivers who use Maple Rentals as a dependable business asset, not just a short-term booking.</p>
              <div className="flex flex-col sm:flex-row items-center justify-start gap-6">
                <Link
                  to="/apply"
                  className="w-full sm:w-auto px-12 py-5 bg-brand-gold text-brand-navy font-bold tracking-widest uppercase text-sm hover:bg-brand-gold-light transition-all duration-300 shadow-xl"
                >
                  Apply Now
                </Link>
                <Link
                  to="/cars"
                  className="w-full sm:w-auto px-12 py-5 border border-white/20 text-white font-bold tracking-widest uppercase text-sm hover:border-brand-gold hover:text-brand-gold transition-all duration-300"
                >
                  Browse Fleet
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="relative hidden lg:block"
            >
              <img
                src="/cta-camry.webp"
                alt="Toyota Camry Hybrid fleet"
                className="w-full h-auto shadow-2xl rounded-3xl"
              />
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}

