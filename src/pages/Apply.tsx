import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, CheckCircle2, ChevronRight, AlertCircle, Car, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import PersonalDetails from '../components/apply/PersonalDetails';
import DriverInfo from '../components/apply/DriverInfo';
import VehiclePreferences from '../components/apply/VehiclePreferences';
import DocumentUpload from '../components/apply/DocumentUpload';
import { ApplicationFormData } from '../types/application';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

export default function Apply() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ApplicationFormData>({
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
    licensePhoto: null,
    uberScreenshot: null,
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

      const data = await response.json();

      if (response.ok) {
        setIsSubmitted(true);
        window.scrollTo(0, 0);
      } else {
        alert(data.error || 'Something went wrong. Please try again.');
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
            Thank you for applying to MAPLE RENTALS. Our team will review your details and contact you within 24 hours.
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
            Apply to rent a Toyota Camry Hybrid and start driving with MAPLE RENTALS.
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
            <PersonalDetails formData={formData} onChange={handleInputChange} />

            {/* SECTION 2: Driver Information */}
            <DriverInfo formData={formData} onChange={handleInputChange} />

            {/* SECTION 3: Vehicle Preference */}
            <VehiclePreferences formData={formData} onChange={handleInputChange} />

            {/* SECTION 4: Document Upload */}
            <DocumentUpload formData={formData} onUpload={handleFileUpload} />

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
