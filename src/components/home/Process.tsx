import { motion } from 'motion/react';
import { fadeIn, staggerContainer } from './animations';

export default function Process() {
  return (
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
  );
}
