import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeIn, staggerContainer } from './animations';

interface HeroProps {
  priceRange: { min: number; max: number } | null;
}

export default function Hero({ priceRange }: HeroProps) {
  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-28 overflow-hidden">
      {/* Subtle radial spotlight */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[1000px] h-[1000px] bg-brand-gold/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-left relative z-20"
          >
            <motion.div variants={fadeIn} className="inline-block mb-6 px-3 py-1 border border-brand-gold/30 rounded-full bg-brand-gold/5 backdrop-blur-sm">
              <span className="text-[10px] font-bold text-brand-gold tracking-[0.2em] uppercase">Sydney's Professional Fleet</span>
            </motion.div>

            <motion.h1 variants={fadeIn} className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight mb-6 leading-[1.05]">
              Toyota Camry Hybrid Fleet for <span className="text-brand-gold opacity-90">Professional Uber Drivers</span>
            </motion.h1>
            <motion.p variants={fadeIn} className="text-sm md:text-base text-brand-grey mb-10 max-w-lg font-light leading-relaxed">
              Reliable hybrid vehicles from <strong className="text-white font-medium">
                {priceRange ? `$${priceRange.min} – $${priceRange.max}` : '$200 – $350'} per week
              </strong>.<br/>
              Insurance, servicing, and Uber compliance included.
            </motion.p>

            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-5 mb-12">
              <Link
                to="/apply"
                className="bg-brand-gold hover:bg-[#b0923b] text-brand-charcoal px-12 py-4 font-bold text-sm uppercase tracking-[0.15em] transition-all shadow-[0_0_15px_rgba(198,169,79,0.1)] hover:shadow-[0_0_25px_rgba(198,169,79,0.2)] flex items-center justify-center gap-3"
              >
                Apply Now <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="tel:0420550556"
                className="bg-transparent border border-white/10 hover:border-brand-gold/30 text-white px-8 py-4 font-medium text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
              >
                Call MAPLE RENTALS
              </a>
            </motion.div>

            <motion.div variants={fadeIn} className="grid grid-cols-2 gap-y-4 gap-x-10 text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">
              <div className="flex items-center gap-2">
                <Check className="w-2.5 h-2.5 text-brand-gold" /> Fully Insured
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-2.5 h-2.5 text-brand-gold" /> Uber Ready
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-2.5 h-2.5 text-brand-gold" /> Hybrid Savings
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-2.5 h-2.5 text-brand-gold" /> No Hidden Fees
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Check className="w-2.5 h-2.5 text-brand-gold" /> 2-Week Bond Only
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative lg:-mr-64"
          >
            {/* Blurred city night texture behind car */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-transparent z-10"></div>
            <div className="absolute -inset-20 bg-[url('https://images.unsplash.com/photo-1495521939206-a217db9df264?auto=format&fit=crop&q=80&w=1200')] bg-cover bg-center opacity-30 blur-2xl rounded-full mix-blend-screen"></div>

            {/* Soft ground shadow */}
            <div className="absolute -bottom-10 left-[15%] w-[110%] h-20 bg-black/80 blur-[60px] rounded-[100%] z-0"></div>
            <div className="absolute -bottom-6 left-[20%] w-[100%] h-12 bg-black/90 blur-[40px] rounded-[100%] z-0"></div>

            <img
              src="https://images.unsplash.com/photo-1621007947382-bb3c3994e3fd?auto=format&fit=crop&q=80&w=1600"
              alt="Toyota Camry Hybrid"
              className="w-[180%] max-w-none h-auto object-cover relative z-10 -ml-[10%]"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
