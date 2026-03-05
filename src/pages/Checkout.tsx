import React, { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { CreditCard, ShieldCheck, CheckCircle2, ArrowLeft, Loader2, Info } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Car } from '../types';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

function CheckoutForm({ amount, onSuccess, onCancel }: { amount: number, onSuccess: () => void, onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/success`,
      },
    });

    if (submitError) {
      setError(submitError.message || 'An error occurred');
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="bg-brand-navy p-6 border border-white/10 rounded-xl">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      {error && <div className="text-red-500 text-[10px] font-bold uppercase tracking-widest">{error}</div>}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-white/10 text-white py-5 font-bold uppercase tracking-widest text-sm hover:bg-white/5 transition-all"
        >
          Back
        </button>
        <button
          disabled={!stripe || processing}
          className="flex-[2] bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {processing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            `Pay $${amount.toFixed(2)} & Start Lease`
          )}
        </button>
      </div>
    </form>
  );
}

export default function Checkout() {
  const { id: car_id } = useParams();
  const [searchParams] = useSearchParams();
  const application_id = searchParams.get('application_id');
  
  // Use React Query for car data
  const { data: car, error: carError, isLoading: isCarLoading } = useQuery<Car>({
    queryKey: ['car', car_id],
    queryFn: async () => {
      const res = await api.get(`/cars/${car_id}`);
      return res.data;
    },
    enabled: !!car_id,
  });

  // Use React Query for subscription initialization
  const { data: subscription, error: subError, isLoading: isSubLoading } = useQuery({
    queryKey: ['checkout-session', car_id, application_id],
    queryFn: async () => {
      const res = await api.post('/create-subscription', {
        car_id: Number(car_id),
        application_id: application_id ? Number(application_id) : undefined,
      });
      return res.data;
    },
    enabled: !!car,
    staleTime: Infinity, // Ensure it only runs once per component lifecycle
    retry: false,
  });

  if (isCarLoading || isSubLoading) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand-gold animate-spin" />
      </div>
    );
  }

  const error = carError || subError;
  if (error) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center text-white">
        <div className="text-center">
          <p className="mb-4">Failed to initialize checkout. Please try again.</p>
          <Link to="/cars" className="text-brand-gold hover:underline">Return to Fleet</Link>
        </div>
      </div>
    );
  }

  const stripeOptions = subscription ? {
    clientSecret: subscription.clientSecret,
    appearance: {
      theme: 'night' as const,
      variables: {
        colorPrimary: '#D4AF37',
        colorBackground: '#0A0E14',
        colorText: '#ffffff',
        colorDanger: '#ef4444',
        fontFamily: 'Space Grotesk, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px',
      },
    },
  } : null;

  const totalAmount = subscription?.billingBreakdown.upfrontDue || 0;

  return (
    <div className="pt-32 pb-24 min-h-screen bg-brand-navy">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <Link 
            to={car ? `/cars/${car.id}` : "/cars"}
            className="inline-flex items-center gap-2 text-brand-grey hover:text-brand-gold transition-colors mb-12 uppercase tracking-widest text-[10px] font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Vehicle
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-7">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={fadeIn}
                className="space-y-12"
              >
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 uppercase tracking-tighter">Secure <span className="text-brand-gold italic">Checkout</span></h1>
                  <p className="text-brand-grey font-light">Complete your upfront payment to start your rental agreement.</p>
                </div>

                {stripeOptions && (
                  <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                    <Elements stripe={stripePromise} options={stripeOptions}>
                      <CheckoutForm 
                        amount={totalAmount}
                        onSuccess={() => {}}
                        onCancel={() => window.history.back()}
                      />
                    </Elements>
                  </div>
                )}

                <div className="flex items-center justify-center gap-8 py-8 border-t border-white/5">
                  <div className="flex items-center gap-2 text-brand-grey text-[10px] font-bold uppercase tracking-widest">
                    <ShieldCheck className="w-4 h-4 text-brand-gold" /> SSL Secure
                  </div>
                  <div className="flex items-center gap-2 text-brand-grey text-[10px] font-bold uppercase tracking-widest">
                    <CheckCircle2 className="w-4 h-4 text-brand-gold" /> Encrypted
                  </div>
                  <div className="flex items-center gap-2 text-brand-grey text-[10px] font-bold uppercase tracking-widest">
                    <CreditCard className="w-4 h-4 text-brand-gold" /> PCI Compliant
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="lg:col-span-5">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="sticky top-32 space-y-8"
              >
                {car && (
                  <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="aspect-video relative">
                      <img src={car.image} alt={car.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-brand-navy to-transparent opacity-60" />
                      <div className="absolute bottom-6 left-6">
                        <h3 className="text-xl font-bold text-white uppercase tracking-tight">{car.name}</h3>
                        <p className="text-brand-gold text-[10px] font-bold uppercase tracking-widest">{car.model_year} Model Hybrid</p>
                      </div>
                    </div>
                    
                    <div className="p-8 space-y-6">
                      <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest border-b border-white/5 pb-4">Upfront Payment Breakdown</h4>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-grey font-light">Security Bond (Refundable)</span>
                          <span className="text-white font-bold">${car.bond.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-grey font-light">First Week Rent</span>
                          <span className="text-white font-bold">${car.weekly_price.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-grey font-light">New Account Setup Fee</span>
                          <span className="text-white font-bold">$10.00</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-grey font-light">Direct Debit Setup Fee</span>
                          <span className="text-white font-bold">$2.20</span>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                        <span className="text-white font-bold uppercase tracking-widest text-xs">Total Due Now</span>
                        <span className="text-3xl font-bold text-brand-gold">${totalAmount.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="bg-brand-navy p-6 flex items-start gap-4">
                      <div className="bg-brand-gold/10 p-2 rounded-lg">
                        <Info className="w-4 h-4 text-brand-gold" />
                      </div>
                      <p className="text-[10px] text-brand-grey leading-relaxed">
                        Following your upfront payment, your recurring weekly rental of <strong>${(car.weekly_price + 1).toFixed(2)}</strong> (including account management fee) will begin 7 days from today.
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                  <h4 className="text-[10px] font-bold text-white uppercase tracking-widest mb-6">What happens next?</h4>
                  <div className="space-y-6">
                    {[
                      { step: 1, text: 'Complete upfront payment' },
                      { step: 2, text: 'Team verifies your driver documents' },
                      { step: 3, text: 'Collect your vehicle from our Sydney hub' }
                    ].map((item) => (
                      <div key={item.step} className="flex gap-4 items-center">
                        <div className="w-6 h-6 rounded-full bg-brand-gold/20 flex items-center justify-center text-brand-gold text-[10px] font-bold">
                          {item.step}
                        </div>
                        <p className="text-xs text-brand-grey font-light">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
