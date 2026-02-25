import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, CarFront, Droplets, Check, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { fetchCars } from '../lib/api';
import type { Car } from '../types';

const fadeIn = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const slideInLeft = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const slideInRight = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

export default function Home() {
  const [priceRange, setPriceRange] = useState<{ min: number; max: number } | null>(null);

  useEffect(() => {
    fetchCars().then((cars) => {
      if (cars.length > 0) {
        const prices = cars.map(c => c.weeklyPrice);
        setPriceRange({
          min: Math.min(...prices),
          max: Math.max(...prices)
        });
      }
    }).catch(err => console.error('Failed to fetch car prices for home page:', err));
  }, []);

  return (
    <div className="bg-brand-charcoal text-white min-h-screen font-sans selection:bg-brand-gold selection:text-black">
      {/* HERO SECTION */}
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

      {/* CREDIBILITY STRIP */}
      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="border-y border-white/5 bg-[#050505]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-[10px] md:text-xs font-medium text-gray-500 uppercase tracking-[0.3em]">
            Serving Professional Uber Drivers Across Sydney
          </p>
        </div>
      </motion.div>

      {/* POSITIONING SECTION */}
      <section className="py-32 bg-brand-charcoal relative border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={slideInLeft}
            >
              <motion.h2 className="text-3xl md:text-4xl font-serif font-bold mb-10 tracking-tight">Not Just a Rental.<br/><span className="text-brand-gold">A Business Tool.</span></motion.h2>
              <motion.div className="space-y-8 text-brand-grey text-lg font-light leading-relaxed">
                <p>
                  When you drive for Uber, your vehicle is your income engine.
                </p>
                <p>
                  MAPLE RENTALS provides professionally maintained Toyota Camry Hybrid vehicles designed for long hours, lower fuel costs, and reliable performance.
                </p>
                <p>
                  We keep your car running smoothly so you can focus on earning.
                </p>
              </motion.div>
            </motion.div>
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="grid grid-cols-1 sm:grid-cols-2 gap-8"
            >
              <motion.div variants={fadeIn} className="bg-brand-charcoal p-10 border border-white/5 hover:border-brand-gold/30 transition-colors">
                <Wrench className="w-8 h-8 text-brand-gold mb-8" />
                <h3 className="text-lg font-bold text-white mb-4 tracking-wide">Professionally Maintained</h3>
                <p className="text-brand-grey text-sm font-light leading-relaxed">Every vehicle is meticulously maintained to ensure zero downtime for your business.</p>
              </motion.div>
              <motion.div variants={fadeIn} className="bg-brand-charcoal p-10 border border-white/5 hover:border-brand-gold/30 transition-colors mt-0 sm:mt-12">
                <Droplets className="w-8 h-8 text-brand-gold mb-8" />
                <h3 className="text-lg font-bold text-white mb-4 tracking-wide">Hybrid Efficiency</h3>
                <p className="text-brand-grey text-sm font-light leading-relaxed">Lower your weekly fuel costs significantly with our exclusive hybrid fleet.</p>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PRICING & BOND SECTION */}
      <section className="py-32 bg-brand-charcoal relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
            className="text-center max-w-3xl mx-auto mb-20"
          >
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6 tracking-tight">Simple Weekly Pricing</h2>
            <p className="text-lg text-brand-grey font-light leading-relaxed mb-8">
              Vehicles available from {priceRange ? `$${priceRange.min} to $${priceRange.max}` : '$200 to $350'} per week.<br/>
              Bond is two weeks rental based on selected vehicle.
            </p>
            <div className="flex flex-wrap justify-center items-center gap-6 text-sm font-light text-gray-300">
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-brand-gold" /> Insurance included</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-brand-gold" /> Servicing included</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-brand-gold" /> No hidden fees</span>
            </div>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto"
          >
            {/* Example Pricing Card 1 */}
            <motion.div variants={fadeIn} className="bg-brand-charcoal border border-white/5 p-10 flex flex-col hover:border-brand-gold/30 transition-colors">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">Standard Hybrid</h3>
                <p className="text-sm text-brand-grey font-light">Older model, excellent condition</p>
              </div>
              <div className="mb-8 pb-8 border-b border-white/5">
                <p className="text-xs text-brand-grey uppercase tracking-widest mb-2">Weekly Rate</p>
                <div className="text-4xl font-bold text-white">${priceRange?.min || 250}</div>
              </div>
              <div>
                <p className="text-xs text-brand-gold uppercase tracking-widest mb-2">Required Bond</p>
                <div className="text-2xl font-bold text-gray-300">${(priceRange?.min || 250) * 2}</div>
                <p className="text-xs text-gray-600 mt-2 font-light">Calculated as 2x Weekly Rate</p>
              </div>
            </motion.div>

            {/* Example Pricing Card 2 */}
            <motion.div variants={fadeIn} className="bg-brand-charcoal border border-brand-gold/30 p-10 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-brand-gold"></div>
              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">Premium Hybrid</h3>
                <p className="text-sm text-brand-grey font-light">Late model, maximum comfort</p>
              </div>
              <div className="mb-8 pb-8 border-b border-white/5">
                <p className="text-xs text-brand-grey uppercase tracking-widest mb-2">Weekly Rate</p>
                <div className="text-4xl font-bold text-white">${priceRange?.max || 350}</div>
              </div>
              <div>
                <p className="text-xs text-brand-gold uppercase tracking-widest mb-2">Required Bond</p>
                <div className="text-2xl font-bold text-gray-300">${(priceRange?.max || 350) * 2}</div>
                <p className="text-xs text-gray-600 mt-2 font-light">Calculated as 2x Weekly Rate</p>
              </div>
            </motion.div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="mt-16 text-center"
          >
            <p className="text-sm text-gray-500 font-light italic">
              * Actual rates depend on vehicle availability and model year.
            </p>
          </motion.div>
        </div>
      </section>

      {/* PROCESS SECTION */}
      <section className="py-32 bg-brand-charcoal border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
            className="text-center mb-24"
          >
            <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight">Start Driving in 3 Steps</h2>
          </motion.div>
          
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-16 relative"
          >
            <div className="hidden md:block absolute top-6 left-[16%] right-[16%] h-[1px] bg-white/5 z-0"></div>
            
            <motion.div variants={fadeIn} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-brand-charcoal border border-brand-gold text-brand-gold flex items-center justify-center text-sm font-bold mb-8 tracking-widest">
                01
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Apply Online</h3>
              <p className="text-brand-grey font-light text-sm leading-relaxed">Submit your driver details and required documents through our secure portal.</p>
            </motion.div>
            
            <motion.div variants={fadeIn} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-brand-charcoal border border-brand-gold text-brand-gold flex items-center justify-center text-sm font-bold mb-8 tracking-widest">
                02
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Get Approved</h3>
              <p className="text-brand-grey font-light text-sm leading-relaxed">Our team verifies your information and prepares your vehicle within 24 hours.</p>
            </motion.div>
            
            <motion.div variants={fadeIn} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-brand-gold text-brand-charcoal flex items-center justify-center text-sm font-bold mb-8 tracking-widest">
                03
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Collect & Start Earning</h3>
              <p className="text-brand-grey font-light text-sm leading-relaxed">Pick up your keys, connect to the Uber app, and start earning immediately.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FINAL CTA SECTION */}
      <section className="py-32 bg-brand-charcoal relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(198,169,79,0.05)_0%,transparent_70%)]"></div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
          >
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-8 leading-tight">Ready to Drive with Sydney's Most Reliable Fleet?</h2>
            <p className="text-xl text-brand-grey mb-12 font-light">Join hundreds of successful Uber drivers who trust MAPLE RENTALS for their business.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link 
                to="/apply" 
                className="w-full sm:w-auto px-12 py-5 bg-brand-gold text-brand-charcoal font-bold tracking-widest uppercase text-sm hover:bg-white transition-colors duration-300"
              >
                Apply Now
              </Link>
              <Link 
                to="/cars" 
                className="w-full sm:w-auto px-12 py-5 border border-white/20 text-white font-bold tracking-widest uppercase text-sm hover:bg-white/5 transition-colors duration-300"
              >
                View Fleet
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
