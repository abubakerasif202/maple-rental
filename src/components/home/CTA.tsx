import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { fadeIn } from './animations';

export default function CTA() {
  return (
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
  );
}
