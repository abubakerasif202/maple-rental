import { Wrench, Droplets } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeIn, slideInLeft, staggerContainer } from './animations';

export default function Positioning() {
  return (
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
  );
}
