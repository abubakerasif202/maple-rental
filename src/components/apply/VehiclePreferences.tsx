import React from 'react';
import { motion } from 'motion/react';
import { Clock } from 'lucide-react';
import { ApplicationFormData } from '../../types/application';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

interface VehiclePreferencesProps {
  formData: ApplicationFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

export default function VehiclePreferences({ formData, onChange }: VehiclePreferencesProps) {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={fadeIn}
    >
      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
        <Clock className="w-5 h-5 text-brand-gold" />
        <h2 className="text-xl font-serif font-bold text-white tracking-tight">Vehicle Preference</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Preferred Weekly Budget</label>
          <select
            name="weeklyBudget"
            value={formData.weeklyBudget}
            onChange={onChange}
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light appearance-none"
          >
            <option value="$200 - $250">$200 - $250</option>
            <option value="$250 - $300">$250 - $300</option>
            <option value="$300 - $350">$300 - $350</option>
          </select>
          <p className="text-[10px] text-brand-grey/60 mt-2 font-light italic">Bond is two weeks rental amount based on selected vehicle.</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Intended Start Date</label>
          <input
            required
            type="date"
            name="intendedStartDate"
            value={formData.intendedStartDate}
            onChange={onChange}
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
          />
        </div>
      </div>
    </motion.section>
  );
}
