import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCars } from '../lib/api';
import { Calendar, Shield, CreditCard, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [car, setCar] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    fetchCars().then(cars => {
      const found = cars.find(c => c.id === id);
      setCar(found);
      setLoading(false);
    });
  }, [id]);

  const calculateTotal = () => {
    if (!startDate || !endDate || !car) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const weeks = diffDays / 7;
    return Math.round(weeks * car.weeklyPrice);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 2000);
  };

  if (loading) return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center">
      <div className="w-12 h-12 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!car) return (
    <div className="min-h-screen bg-brand-navy flex flex-col items-center justify-center text-white p-6">
      <h1 className="text-2xl font-serif mb-4">Vehicle Not Found</h1>
      <button onClick={() => navigate('/cars')} className="text-brand-gold hover:underline">Back to Fleet</button>
    </div>
  );

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center p-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-brand-navy-light p-12 border border-brand-gold/30 max-w-md w-full text-center shadow-2xl"
        >
          <CheckCircle2 className="w-20 h-20 text-brand-gold mx-auto mb-8" />
          <h1 className="text-3xl font-serif font-bold text-white mb-4">Booking Confirmed</h1>
          <p className="text-brand-grey mb-10 font-light">Your request for the {car.name} has been received. Our team will contact you within 24 hours to finalize the paperwork.</p>
          <button 
            onClick={() => navigate('/')}
            className="w-full bg-brand-gold text-brand-navy py-4 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all"
          >
            Return Home
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="bg-brand-navy min-h-screen py-24 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button 
          onClick={() => navigate('/cars')}
          className="flex items-center gap-2 text-brand-grey hover:text-white mb-12 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Fleet
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Left: Booking Form */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-brand-navy-light p-8 md:p-12 border border-white/10 shadow-xl"
          >
            <h1 className="text-3xl font-serif font-bold mb-8">Secure Your Vehicle</h1>
            
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Rental Start Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gold" />
                    <input 
                      type="date" 
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-brand-navy border border-white/10 p-4 pl-12 text-sm focus:border-brand-gold outline-none transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Expected End Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gold" />
                    <input 
                      type="date" 
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-brand-navy border border-white/10 p-4 pl-12 text-sm focus:border-brand-gold outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-white/10">
                <div className="flex items-center gap-4 text-sm text-brand-grey font-light">
                  <Shield className="w-5 h-5 text-brand-gold" />
                  <span>Full comprehensive insurance included in weekly rate.</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-brand-grey font-light">
                  <CreditCard className="w-5 h-5 text-brand-gold" />
                  <span>No payment required today. Pay bond and first week on collection.</span>
                </div>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSubmitting ? 'Processing...' : 'Confirm Booking Request'}
              </button>
            </form>
          </motion.div>

          {/* Right: Summary */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            <div className="bg-brand-navy-light border border-white/10 overflow-hidden shadow-xl">
              <div className="h-48 overflow-hidden">
                <img src={car.image} alt={car.name} className="w-full h-full object-cover" />
              </div>
              <div className="p-8">
                <h2 className="text-2xl font-serif font-bold mb-2">{car.name}</h2>
                <p className="text-brand-grey text-sm font-light mb-6 uppercase tracking-widest">{car.modelYear} Toyota Camry Hybrid</p>
                
                <div className="space-y-4 border-t border-white/10 pt-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-grey font-light">Weekly Rate</span>
                    <span className="font-bold text-white">${car.weeklyPrice}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-grey font-light">Security Bond (Refundable)</span>
                    <span className="font-bold text-white">${car.bond}</span>
                  </div>
                  <div className="flex justify-between text-lg border-t border-white/10 pt-4 mt-4">
                    <span className="font-serif font-bold text-brand-gold">Estimated Total</span>
                    <span className="font-bold text-white">${calculateTotal() || car.weeklyPrice}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 italic mt-4">
                    * Total is estimated based on selected dates. Final amount confirmed upon document verification.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-brand-gold/5 border border-brand-gold/20 p-6">
              <h3 className="text-xs font-bold text-brand-gold uppercase tracking-widest mb-4">Required Documents</h3>
              <ul className="text-xs text-brand-grey space-y-2 font-light">
                <li>• Valid NSW Driver's Licence</li>
                <li>• Proof of Identity (Passport or Birth Certificate)</li>
                <li>• Proof of Address (Utility Bill or Bank Statement)</li>
                <li>• Active Uber Driver Account Details</li>
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
