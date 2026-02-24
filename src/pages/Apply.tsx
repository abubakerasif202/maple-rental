import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, CheckCircle2, Upload, Calendar, User, Phone, Mail, MapPin, CreditCard, Clock, ChevronRight, AlertCircle, Car } from 'lucide-react';
import { Link } from 'react-router-dom';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

export default function Apply() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    licenseNumber: '',
    licenseExpiry: '',
    uberStatus: 'Not Yet Registered',
    experience: '',
    weeklyBudget: '$250 - $300',
    intendedStartDate: '',
    licensePhoto: null as string | null,
    uberScreenshot: null as string | null,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'licensePhoto' | 'uberScreenshot') => {
    const file = e.target.files?.[0];
    if (file) {
      // In a real app, we'd upload to a server. Here we'll just use a dummy string or base64
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSubmitted(true);
        window.scrollTo(0, 0);
      } else {
        alert('Something went wrong. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting application:', error);
      alert('Failed to submit application. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-brand-charcoal pt-32 pb-20 px-4 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-brand-charcoal border border-brand-gold/30 p-12 text-center rounded-2xl shadow-2xl relative overflow-hidden"
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
            className="inline-block bg-brand-gold text-brand-charcoal px-10 py-4 font-bold text-sm uppercase tracking-widest hover:bg-white transition-colors w-full"
          >
            Return Home
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-charcoal pt-32 pb-32 px-4 selection:bg-brand-gold selection:text-brand-charcoal">
      <div className="max-w-4xl mx-auto">
        {/* HEADER */}
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-serif font-bold text-white mb-4 tracking-tight"
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

        {/* FORM */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-brand-charcoal border border-white/5 rounded-2xl shadow-2xl overflow-hidden"
        >
          <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-12">
            
            {/* SECTION 1: Personal Details */}
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
                    onChange={handleInputChange}
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
                    onChange={handleInputChange}
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
                    onChange={handleInputChange}
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
                    onChange={handleInputChange}
                    placeholder="Street, Suburb, Postcode"
                    className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                  />
                </div>
              </div>
            </motion.section>

            {/* SECTION 2: Driver Information */}
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
                    onChange={handleInputChange}
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
                    onChange={handleInputChange}
                    className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Uber Status</label>
                  <select 
                    name="uberStatus"
                    value={formData.uberStatus}
                    onChange={handleInputChange}
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
                    onChange={handleInputChange}
                    placeholder="e.g. 5 years"
                    className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                  />
                </div>
              </div>
            </motion.section>

            {/* SECTION 3: Vehicle Preference */}
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
                    onChange={handleInputChange}
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
                    onChange={handleInputChange}
                    className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                  />
                </div>
              </div>
            </motion.section>

            {/* SECTION 4: Document Upload */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeIn}
            >
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                <Upload className="w-5 h-5 text-brand-gold" />
                <h2 className="text-xl font-serif font-bold text-white tracking-tight">Document Upload</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Driver License (Front & Back)</label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'licensePhoto')}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                    <div className={`border-2 border-dashed ${formData.licensePhoto ? 'border-brand-gold/50 bg-brand-gold/5' : 'border-white/10 group-hover:border-brand-gold/30'} p-8 text-center transition-all rounded-xl`}>
                      {formData.licensePhoto ? (
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle2 className="w-8 h-8 text-brand-gold" />
                          <span className="text-xs text-brand-gold font-bold uppercase tracking-widest">File Uploaded</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-8 h-8 text-brand-grey/40 group-hover:text-brand-gold transition-colors" />
                          <span className="text-xs text-brand-grey/60 font-light">Drag & drop or click to upload</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Uber Profile Screenshot (if active)</label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'uberScreenshot')}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                    <div className={`border-2 border-dashed ${formData.uberScreenshot ? 'border-brand-gold/50 bg-brand-gold/5' : 'border-white/10 group-hover:border-brand-gold/30'} p-8 text-center transition-all rounded-xl`}>
                      {formData.uberScreenshot ? (
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle2 className="w-8 h-8 text-brand-gold" />
                          <span className="text-xs text-brand-gold font-bold uppercase tracking-widest">File Uploaded</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-8 h-8 text-brand-grey/40 group-hover:text-brand-gold transition-colors" />
                          <span className="text-xs text-brand-grey/60 font-light">Drag & drop or click to upload</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-8 flex items-start gap-3 p-4 bg-brand-charcoal/50 border border-white/5 rounded-lg">
                <Lock className="w-4 h-4 text-brand-gold mt-0.5" />
                <p className="text-[10px] text-brand-grey/60 font-light leading-relaxed">
                  Files are securely stored and reviewed by Maple Rentals management only. Your information is never shared with third parties.
                </p>
              </div>
            </motion.section>

            {/* SUBMIT */}
            <div className="pt-8">
              <button 
                disabled={isSubmitting}
                type="submit"
                className="w-full bg-brand-gold hover:bg-white text-brand-charcoal px-12 py-5 font-bold text-sm uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(198,169,79,0.1)] hover:shadow-[0_0_30px_rgba(198,169,79,0.2)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Processing...' : 'Submit Application'}
                {!isSubmitting && <ChevronRight className="w-4 h-4" />}
              </button>
              <p className="text-center text-[10px] text-brand-grey/60 mt-6 uppercase tracking-[0.2em] font-medium">
                Our team will contact you within 24 hours.
              </p>
            </div>
          </form>
        </motion.div>

        {/* TRUST ELEMENTS */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            visible: { transition: { staggerChildren: 0.1 } }
          }}
          className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            { icon: ShieldCheck, text: 'Secure & Confidential' },
            { icon: AlertCircle, text: 'No Hidden Fees' },
            { icon: CreditCard, text: 'Transparent Bond' },
            { icon: Car, text: 'Professional Fleet' }
          ].map((item, i) => (
            <motion.div 
              key={i} 
              variants={fadeIn}
              className="flex flex-col items-center text-center p-6 bg-brand-charcoal border border-white/5 rounded-xl"
            >
              <item.icon className="w-5 h-5 text-brand-gold mb-3" />
              <span className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">{item.text}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
