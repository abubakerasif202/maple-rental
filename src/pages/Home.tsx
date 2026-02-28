import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, CarFront, Droplets, Check, Wrench } from 'lucide-react';
import { motion, Variants } from 'motion/react';
import InquiryForm from '../components/InquiryForm';

const fadeIn: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const slideInRight: Variants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

export default function Home() {
  return (
    <div className="bg-white text-brand-navy min-h-screen font-sans selection:bg-brand-gold selection:text-black">
      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden bg-[#F8F9FA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="text-left"
            >
              <motion.h1 variants={fadeIn} className="text-5xl lg:text-7xl font-serif font-bold tracking-tight mb-8 leading-[1.1] text-brand-navy">
                Premium Hybrid Fleet for Professional Drivers.
              </motion.h1>
              <motion.p variants={fadeIn} className="text-lg text-slate-600 mb-10 max-w-lg font-light leading-relaxed">
                Drive with confidence in our meticulously maintained Toyota Camry Hybrids. Reliable, efficient, and Uber-compliant, designed to maximize your earnings.
              </motion.p>

              <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  to="/apply"
                  className="bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-10 py-4 font-bold text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                >
                  Apply Now <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/cars"
                  className="bg-white border border-brand-gold text-brand-navy px-10 py-4 font-bold text-sm uppercase tracking-widest transition-all flex items-center justify-center hover:bg-brand-gold/5"
                >
                  View Fleet
                </Link>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <img
                src="https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&q=80&w=1600"
                alt="Toyota Camry Hybrid"
                className="w-full h-auto object-cover relative z-10"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* INQUIRY SECTION */}
      <section className="pb-32 bg-[#F8F9FA] relative z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <InquiryForm />
        </div>
      </section>

      {/* CREDIBILITY STRIP */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="border-y border-white/10 bg-brand-navy-light"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-[10px] md:text-xs font-bold text-brand-gold uppercase tracking-[0.4em]">
            SERVING PROFESSIONAL UBER DRIVERS ACROSS SYDNEY
          </p>
        </div>
      </motion.div>

      {/* POSITIONING SECTION */}
      <section className="py-32 bg-brand-navy relative overflow-hidden">
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#D4AF37 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={slideInLeft}
            >
              <h2 className="text-4xl md:text-6xl font-serif font-bold mb-10 tracking-tight leading-tight text-white">
                Not Just a Rental.<br />A Business Tool.
              </h2>
              <div className="space-y-6 text-slate-400 text-lg font-light leading-relaxed max-w-xl">
                <p>
                  Maple Rentals provides professionally maintained Toyota Camry Hybrid vehicles designed for long hours, lower fuel costs, and reliable performance.
                </p>
                <p>
                  We keep your car running smoothly so you can focus on earning. Our fleet is meticulously maintained to ensure zero downtime for your business.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="space-y-6"
            >
              <motion.div variants={fadeIn} className="bg-brand-navy-light p-8 border border-brand-gold/30 flex items-start gap-6 group hover:bg-brand-navy transition-colors">
                <div className="bg-brand-gold/10 p-4 rounded-lg">
                  <Wrench className="w-8 h-8 text-brand-gold" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 tracking-wide">Professional Maintenance</h3>
                  <p className="text-slate-400 text-sm font-light leading-relaxed">Every vehicle is meticulously maintained to ensure zero downtime for your business.</p>
                </div>
              </motion.div>

              <motion.div variants={fadeIn} className="bg-brand-navy-light p-8 border border-brand-gold/30 flex items-start gap-6 group hover:bg-brand-navy transition-colors">
                <div className="bg-brand-gold/10 p-4 rounded-lg">
                  <Droplets className="w-8 h-8 text-brand-gold" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 tracking-wide">Hybrid Efficiency</h3>
                  <p className="text-slate-400 text-sm font-light leading-relaxed">Lower your weekly feel costs significantly with our exclusive hybrid fleet.</p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PROCESS SECTION */}
      <section className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            className="mb-20"
          >
            <h2 className="text-4xl md:text-6xl font-serif font-bold tracking-tight text-brand-navy mb-6">Start Driving in 3 Steps</h2>
            <p className="text-slate-600 text-lg font-light">Drive your weekly returns and conclusive a catching fleet.</p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-12"
          >
            {[
              { step: '01', title: 'Apply Online', desc: 'Submit your driver details and required documents through our secure portal.' },
              { step: '02', title: 'Get Approved', desc: 'Our team verifies your information and prepares your vehicle within 24 hours.' },
              { step: '03', title: 'Collect & Start Earning', desc: 'Pick up your keys, connect to the Uber app, and start earning immediately.' }
            ].map((item, i) => (
              <motion.div key={i} variants={fadeIn} className="flex flex-col items-center">
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

      {/* FINAL CTA SECTION */}
      <section className="py-32 bg-brand-navy relative overflow-hidden border-t border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.05)_0%,transparent_70%)]"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
              className="text-left"
            >
              <h2 className="text-4xl md:text-6xl font-serif font-bold mb-8 leading-tight text-white">Ready to Drive with Sydney's Most Reliable Fleet?</h2>
              <p className="text-xl text-slate-400 mb-12 font-light">Join hundreds of successful Uber drivers who trust Maple Rentals for their business.</p>
              <div className="flex flex-col sm:flex-row items-center justify-start gap-6">
                <Link
                  to="/apply"
                  className="w-full sm:w-auto px-12 py-5 bg-brand-gold text-brand-navy font-bold tracking-widest uppercase text-sm hover:bg-brand-gold-light transition-all duration-300 shadow-xl"
                >
                  Apply Now
                </Link>
                <Link
                  to="/cars"
                  className="w-full sm:w-auto px-12 py-5 border border-white/20 text-white font-bold tracking-widest uppercase text-sm hover:bg-white/5 transition-all duration-300"
                >
                  View Fleet
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="relative hidden lg:block"
            >
              <img
                src="https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&q=80&w=1600"
                alt="Toyota Camry Rear"
                className="w-full h-auto shadow-2xl rounded-lg"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
