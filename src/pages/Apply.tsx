import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, CheckCircle2, User, CreditCard, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '../lib/api';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

const applySchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  email: z.string().email('Invalid email address'),
  address: z.string().min(5, 'Residential address is required'),
  licenseNumber: z.string().min(5, 'License number is required'),
  licenseExpiry: z.string().min(1, 'License expiry date is required'),
  uberStatus: z.enum(['Active', 'Applying', 'Not Yet Registered']),
  experience: z.string().min(1, 'Experience is required'),
  weeklyBudget: z.string().optional(),
  intendedStartDate: z.string().min(1, 'Start date is required'),
  licensePhoto: z.string().optional().nullable(),
  uberScreenshot: z.string().optional().nullable(),
});

type ApplyValues = z.infer<typeof applySchema>;

export default function Apply() {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      uberStatus: 'Not Yet Registered',
      weeklyBudget: '$250 - $300',
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'licensePhoto' | 'uberScreenshot') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setValue(field, base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: ApplyValues) => {
    try {
      await api.post('/applications', data);
      setIsSubmitted(true);
      window.scrollTo(0, 0);
    } catch (error) {
      console.error('Error submitting application:', error);
      alert('Failed to submit application. Please check your connection.');
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-brand-navy pt-32 pb-20 px-4 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-brand-navy-light border border-brand-gold/30 p-12 text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-gold"></div>
          <div className="w-20 h-20 bg-brand-gold/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-10 h-10 text-brand-gold" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-white mb-4 tracking-tight">Application Received</h1>
          <p className="text-brand-grey font-light leading-relaxed mb-10">
            Thank you for applying to Maple Rentals. Our team will review your details and contact you within 24 hours.
          </p>
          <Link 
            to="/" 
            className="inline-block bg-brand-gold text-brand-navy px-10 py-4 font-bold text-sm uppercase tracking-widest hover:bg-brand-gold-light transition-colors w-full"
          >
            Return Home
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-navy pt-32 pb-32 px-4 selection:bg-brand-gold selection:text-brand-navy">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-serif font-bold text-white mb-4 tracking-tight"
          >
            Driver Application
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-brand-grey text-lg font-light mb-6"
          >
            Apply to rent a Toyota Camry Hybrid and start driving with Maple Rentals.
          </motion.p>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-2 text-brand-gold text-xs font-medium uppercase tracking-widest"
          >
            <ShieldCheck className="w-4 h-4" />
            Secure application. All information confidential.
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-brand-navy-light border border-white/10 shadow-2xl overflow-hidden"
        >
          <form onSubmit={handleSubmit(onSubmit)} className="p-8 md:p-12 space-y-12">
            
            <motion.section variants={fadeIn} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/10">
                <User className="w-5 h-5 text-brand-gold" />
                <h2 className="text-xl font-serif font-bold text-white tracking-tight">Personal Details</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Full Name</label>
                  <input {...register('name')} placeholder="As shown on license" className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light" />
                  {errors.name && <p className="text-red-500 text-[10px]">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Phone Number</label>
                  <input {...register('phone')} placeholder="04XX XXX XXX" className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light" />
                  {errors.phone && <p className="text-red-500 text-[10px]">{errors.phone.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Email Address</label>
                  <input {...register('email')} placeholder="example@email.com" className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light" />
                  {errors.email && <p className="text-red-500 text-[10px]">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Residential Address</label>
                  <input {...register('address')} placeholder="Street, Suburb, Postcode" className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light" />
                  {errors.address && <p className="text-red-500 text-[10px]">{errors.address.message}</p>}
                </div>
              </div>
            </motion.section>

            <motion.section variants={fadeIn} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/10">
                <CreditCard className="w-5 h-5 text-brand-gold" />
                <h2 className="text-xl font-serif font-bold text-white tracking-tight">Driver Information</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Driver License Number</label>
                  <input {...register('licenseNumber')} className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light" />
                  {errors.licenseNumber && <p className="text-red-500 text-[10px]">{errors.licenseNumber.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">License Expiry Date</label>
                  <input type="date" {...register('licenseExpiry')} className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light" />
                  {errors.licenseExpiry && <p className="text-red-500 text-[10px]">{errors.licenseExpiry.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Uber Status</label>
                  <select {...register('uberStatus')} className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light appearance-none">
                    <option value="Active">Active</option>
                    <option value="Applying">Applying</option>
                    <option value="Not Yet Registered">Not Yet Registered</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Years of Driving Experience</label>
                  <input {...register('experience')} placeholder="e.g. 5 years" className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light" />
                  {errors.experience && <p className="text-red-500 text-[10px]">{errors.experience.message}</p>}
                </div>
              </div>
            </motion.section>

            <div className="pt-8">
              <button disabled={isSubmitting} type="submit" className="w-full bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-12 py-5 font-bold text-sm uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50">
                {isSubmitting ? 'Processing...' : 'Submit Application'}
                {!isSubmitting && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
