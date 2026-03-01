import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '../lib/api';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function CheckoutForm({ amount }: { amount: number }) {
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
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="bg-brand-navy p-6 border border-white/10 rounded-xl">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      {error && <div className="text-red-500 text-[10px] font-bold uppercase tracking-widest">{error}</div>}
      <button
        disabled={!stripe || processing}
        className="w-full bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
      >
        {processing ? (
          <div className="w-5 h-5 border-2 border-brand-navy border-t-transparent rounded-full animate-spin"></div>
        ) : (
          `Securely Pay $${amount}`
        )}
      </button>
    </form>
  );
}

export default function Checkout() {
  const location = useLocation();
  const { car, totalAmount } = location.state || {};
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    if (car && totalAmount) {
      api.post('/create-subscription', {
        carId: car.id,
      })
        .then(res => setClientSecret(res.data.clientSecret))
        .catch(err => console.error('Stripe error:', err));
    }
  }, [car, totalAmount]);

  if (!car) return <div className="min-h-screen bg-brand-navy pt-32 text-center text-white">No vehicle selected</div>;

  return (
    <div className="min-h-screen bg-brand-navy pt-32 pb-20 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-serif font-bold text-white mb-8 tracking-tight">Secure Checkout</h1>
        <div className="bg-brand-navy-light p-8 md:p-12 border border-white/10 shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-gold"></div>

          <div className="mb-10 pb-10 border-b border-white/10 flex justify-between items-end">
            <div>
              <p className="text-brand-grey text-[10px] font-bold uppercase tracking-widest mb-2">Vehicle</p>
              <h2 className="text-2xl font-serif font-bold text-white">{car.name}</h2>
            </div>
            <div className="text-right">
              <p className="text-brand-grey text-[10px] font-bold uppercase tracking-widest mb-2">Total Due</p>
              <p className="text-3xl font-bold text-brand-gold">${totalAmount}</p>
            </div>
          </div>

          {clientSecret ? (
            <Elements stripe={stripePromise} options={{
              clientSecret,
              appearance: {
                theme: 'night',
                variables: {
                  colorPrimary: '#D4AF37',
                  colorBackground: '#0F172A',
                  colorText: '#ffffff',
                  colorDanger: '#ef4444',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  spacingUnit: '4px',
                  borderRadius: '8px',
                }
              }
            }}>
              <CheckoutForm amount={totalAmount} />
            </Elements>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-2 border-brand-gold border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-[10px] text-brand-grey uppercase tracking-widest font-bold">Initializing Secure Payment</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
