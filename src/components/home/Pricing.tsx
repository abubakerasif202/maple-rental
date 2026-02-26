import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeIn, staggerContainer } from './animations';

interface PricingProps {
  priceRange: { min: number; max: number } | null;
}

export default function Pricing({ priceRange }: PricingProps) {
  return (
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
  );
}
