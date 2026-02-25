import React from 'react';
import { motion } from 'motion/react';
import { CreditCard } from 'lucide-react';
import { ApplicationFormData } from '../../types/application';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

interface DriverInfoProps {
  formData: ApplicationFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

export default function DriverInfo({ formData, onChange }: DriverInfoProps) {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={fadeIn}
    >
      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
        <CreditCard className="w-5 h-5 text-brand-gold" />
        <h2 className="text-xl font-serif font-bold text-white tracking-tight">Driver Information</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Driver License Number</label>
          <input
            required
            type="text"
            name="licenseNumber"
            value={formData.licenseNumber}
            onChange={onChange}
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">License Expiry Date</label>
          <input
            required
            type="date"
            name="licenseExpiry"
            value={formData.licenseExpiry}
            onChange={onChange}
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Uber Status</label>
          <select
            name="uberStatus"
            value={formData.uberStatus}
            onChange={onChange}
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light appearance-none"
          >
            <option value="Active">Active</option>
            <option value="Applying">Applying</option>
            <option value="Not Yet Registered">Not Yet Registered</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Years of Driving Experience</label>
          <input
            required
            type="text"
            name="experience"
            value={formData.experience}
            onChange={onChange}
            placeholder="e.g. 5 years"
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
          />
        </div>
      </div>
    </motion.section>
  );
}
