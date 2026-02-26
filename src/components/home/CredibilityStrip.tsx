import { motion } from 'motion/react';

export default function CredibilityStrip() {
  return (
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
  );
}
