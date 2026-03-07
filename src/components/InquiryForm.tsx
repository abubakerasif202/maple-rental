import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, User, Mail, Phone, Send, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const inquirySchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  message: z.string().optional(),
});

type InquiryValues = z.infer<typeof inquirySchema>;

export default function InquiryForm() {
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InquiryValues>({
    resolver: zodResolver(inquirySchema),
  });

  const onSubmit = async (data: InquiryValues) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSuccess(true);
    reset();
  };

  if (isSuccess) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-brand-navy-light p-8 md:p-12 border border-brand-gold/30 text-center shadow-2xl"
      >
        <CheckCircle2 className="w-16 h-16 text-brand-gold mx-auto mb-6" />
        <h3 className="text-2xl font-serif font-bold text-white mb-4">Inquiry Received</h3>
        <p className="text-brand-grey mb-8 font-light">Thank you for your interest. Our fleet manager will contact you shortly to discuss vehicle availability.</p>
        <button 
          onClick={() => setIsSuccess(false)}
          className="text-brand-gold hover:text-white transition-colors text-sm font-bold uppercase tracking-widest"
        >
          Send Another Inquiry
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-brand-navy-light p-8 md:p-12 border border-white/10 shadow-2xl relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-gold/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
      
      <h3 className="text-2xl md:text-3xl font-serif font-bold text-white mb-2">Check Availability</h3>
      <p className="text-brand-grey text-sm font-light mb-10 uppercase tracking-widest">Reserve your professional fleet vehicle</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gold/50" />
              <input 
                {...register('name')}
                placeholder="John Doe"
                className={`w-full bg-brand-navy border ${errors.name ? 'border-red-500' : 'border-white/10'} p-4 pl-12 text-sm text-white focus:border-brand-gold outline-none transition-colors placeholder:text-white/20`}
              />
            </div>
            {errors.name && <p className="text-red-500 text-[10px] uppercase tracking-widest">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gold/50" />
              <input 
                {...register('email')}
                placeholder="john@example.com"
                className={`w-full bg-brand-navy border ${errors.email ? 'border-red-500' : 'border-white/10'} p-4 pl-12 text-sm text-white focus:border-brand-gold outline-none transition-colors placeholder:text-white/20`}
              />
            </div>
            {errors.email && <p className="text-red-500 text-[10px] uppercase tracking-widest">{errors.email.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gold/50" />
              <input 
                {...register('phone')}
                placeholder="0400 000 000"
                className={`w-full bg-brand-navy border ${errors.phone ? 'border-red-500' : 'border-white/10'} p-4 pl-12 text-sm text-white focus:border-brand-gold outline-none transition-colors placeholder:text-white/20`}
              />
            </div>
            {errors.phone && <p className="text-red-500 text-[10px] uppercase tracking-widest">{errors.phone.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Start Date</label>
              <input 
                type="date" 
                {...register('startDate')}
                className={`w-full bg-brand-navy border ${errors.startDate ? 'border-red-500' : 'border-white/10'} p-4 text-sm text-white focus:border-brand-gold outline-none transition-colors`}
              />
              {errors.startDate && <p className="text-red-500 text-[10px] uppercase tracking-widest">{errors.startDate.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">End Date</label>
              <input 
                type="date" 
                {...register('endDate')}
                className={`w-full bg-brand-navy border ${errors.endDate ? 'border-red-500' : 'border-white/10'} p-4 text-sm text-white focus:border-brand-gold outline-none transition-colors`}
              />
              {errors.endDate && <p className="text-red-500 text-[10px] uppercase tracking-widest">{errors.endDate.message}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Additional Notes (Optional)</label>
          <textarea 
            {...register('message')}
            rows={3}
            placeholder="Tell us about your requirements..."
            className="w-full bg-brand-navy border border-white/10 p-4 text-sm text-white focus:border-brand-gold outline-none transition-colors placeholder:text-white/20 resize-none"
          ></textarea>
        </div>

        <button 
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-brand-navy border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>Submit Inquiry <Send className="w-4 h-4" /></>
          )}
        </button>
      </form>
    </motion.div>
  );
}
