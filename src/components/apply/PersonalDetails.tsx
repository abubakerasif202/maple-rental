import React from 'react';
import { motion } from 'motion/react';
import { User } from 'lucide-react';
import { ApplicationFormData } from '../../types/application';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

interface PersonalDetailsProps {
  formData: ApplicationFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function PersonalDetails({ formData, onChange }: PersonalDetailsProps) {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={fadeIn}
    >
      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
        <User className="w-5 h-5 text-brand-gold" />
        <h2 className="text-xl font-serif font-bold text-white tracking-tight">Personal Details</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Full Name</label>
          <input
            required
            type="text"
            name="name"
            value={formData.name}
            onChange={onChange}
            placeholder="As shown on license"
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Phone Number</label>
          <input
            required
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={onChange}
            placeholder="04XX XXX XXX"
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Email Address</label>
          <input
            required
            type="email"
            name="email"
            value={formData.email}
            onChange={onChange}
            placeholder="example@email.com"
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Residential Address</label>
          <input
            required
            type="text"
            name="address"
            value={formData.address}
            onChange={onChange}
            placeholder="Street, Suburb, Postcode"
            className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
          />
        </div>
      </div>
    </motion.section>
  );
}
