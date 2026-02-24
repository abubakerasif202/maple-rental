import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { createCheckoutSession } from '../lib/api';
import { CreditCard, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function Checkout() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { startDate, endDate, totalPrice, car } = location.state || {};
  const weeklyPrice = Number(car?.weeklyPrice || 0);
  const estimatedWeeks = weeklyPrice > 0 ? (Number(totalPrice) / weeklyPrice).toFixed(1) : null;

  const [formData, setFormData] = useState({
    customerName: '',
    email: '',
    phone: '',
    licenseNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!startDate || !endDate || !totalPrice || !car) {
    return <div className="text-center py-32 text-2xl font-serif font-bold text-brand-grey bg-brand-charcoal min-h-screen">Invalid booking details. Please go back and select dates.</div>;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await createCheckoutSession({
        ...formData,
        carId: id,
        startDate,
        endDate,
        totalPrice,
      });
      
      if (data.url) {
        window.location.href = data.url; // Redirect to Stripe
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during checkout');
      setLoading(false);
    }
  };

  return (
    <div className="bg-brand-charcoal min-h-screen py-24 text-white selection:bg-brand-gold selection:text-brand-charcoal">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center text-brand-grey hover:text-brand-gold font-bold mb-12 transition-colors uppercase tracking-[0.2em] text-[10px]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Car Details
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Checkout Form */}
          <div className="lg:col-span-2">
            <div className="bg-brand-charcoal border border-white/5 rounded-2xl shadow-2xl p-8 md:p-12">
              <h2 className="text-3xl font-serif font-bold text-white tracking-tight mb-8">Secure Checkout</h2>
              
              {error && (
                <div className="bg-red-900/20 border-l-4 border-red-500 p-4 mb-8">
                  <p className="text-red-400 font-medium text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Full Name</label>
                    <input 
                      type="text" 
                      name="customerName"
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Email Address</label>
                    <input 
                      type="email" 
                      name="email"
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Phone Number</label>
                    <input 
                      type="tel" 
                      name="phone"
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Driver's License Number</label>
                    <input 
                      type="text" 
                      name="licenseNumber"
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="pt-8 border-t border-white/5">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-brand-gold hover:bg-white text-brand-charcoal font-bold py-5 uppercase tracking-widest text-sm transition-all shadow-[0_0_20px_rgba(198,169,79,0.1)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-charcoal"></div>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5" /> Proceed to Payment
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-brand-grey/60 mt-6 flex items-center justify-center gap-2 uppercase tracking-widest">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Secure payment powered by Stripe
                  </p>
                </div>
              </form>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-brand-charcoal border border-white/5 rounded-2xl shadow-2xl p-8 text-white sticky top-32">
              <h3 className="text-xl font-serif font-bold mb-8 border-b border-white/5 pb-4">Booking Summary</h3>
              
              <div className="flex items-center gap-4 mb-8">
                <img src={car.image} alt={car.name} className="w-24 h-24 object-cover rounded-xl border border-white/5" referrerPolicy="no-referrer" />
                <div>
                  <h4 className="font-bold text-lg">{car.name}</h4>
                  <p className="text-brand-gold font-medium">${weeklyPrice} / week</p>
                </div>
              </div>

              <div className="space-y-4 mb-8 text-sm font-light">
                <div className="flex justify-between">
                  <span className="text-brand-grey">Pickup Date</span>
                  <span className="font-medium">{startDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-grey">Return Date</span>
                  <span className="font-medium">{endDate}</span>
                </div>
                <div className="flex justify-between pt-4 border-t border-white/5">
                  <span className="text-brand-grey">Duration</span>
                  <span className="font-medium">{estimatedWeeks ? `${estimatedWeeks} Weeks` : 'N/A'}</span>
                </div>
              </div>

              <div className="border-t border-white/5 pt-6">
                <div className="flex justify-between items-end">
                  <span className="text-lg font-serif font-bold">Total Due</span>
                  <span className="text-4xl font-bold text-brand-gold">${totalPrice}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
