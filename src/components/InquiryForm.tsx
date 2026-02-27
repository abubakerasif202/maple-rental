import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, User, Mail, Phone, Send, CheckCircle2 } from 'lucide-react';

export default function InquiryForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    startDate: '',
    endDate: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        startDate: '',
        endDate: '',
        message: ''
      });
    }, 1500);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gold/50" />
              <input 
                type="text" 
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
                className="w-full bg-brand-navy border border-white/10 p-4 pl-12 text-sm text-white focus:border-brand-gold outline-none transition-colors placeholder:text-white/20"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gold/50" />
              <input 
                type="email" 
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="john@example.com"
                className="w-full bg-brand-navy border border-white/10 p-4 pl-12 text-sm text-white focus:border-brand-gold outline-none transition-colors placeholder:text-white/20"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gold/50" />
              <input 
                type="tel" 
                name="phone"
                required
                value={formData.phone}
                onChange={handleChange}
                placeholder="0400 000 000"
                className="w-full bg-brand-navy border border-white/10 p-4 pl-12 text-sm text-white focus:border-brand-gold outline-none transition-colors placeholder:text-white/20"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Start Date</label>
              <input 
                type="date" 
                name="startDate"
                required
                value={formData.startDate}
                onChange={handleChange}
                className="w-full bg-brand-navy border border-white/10 p-4 text-sm text-white focus:border-brand-gold outline-none transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">End Date</label>
              <input 
                type="date" 
                name="endDate"
                required
                value={formData.endDate}
                onChange={handleChange}
                className="w-full bg-brand-navy border border-white/10 p-4 text-sm text-white focus:border-brand-gold outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Additional Notes (Optional)</label>
          <textarea 
            name="message"
            rows={3}
            value={formData.message}
            onChange={handleChange}
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
