import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, CheckCircle2, User, CreditCard, ChevronRight, X, AlertCircle, Loader2, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import * as apiMethods from '../lib/api';
import api from '../lib/api';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

const applySchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  phone: z.string().regex(/^(?:\+61|0)4\d{8}$/, 'Valid Australian mobile number required (04XX XXX XXX)'),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  address: z.string().min(5, 'Residential address is required'),
  license_number: z.string().min(5, 'License number is required'),
  license_expiry: z.string().min(1, 'License expiry date is required').refine((date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(date) > today;
  }, 'License must not be expired'),
  uber_status: z.enum(['Active', 'Applying', 'Not Yet Registered']),
  experience: z.string().min(1, 'Experience is required'),
  weekly_budget: z.string().optional(),
  intended_start_date: z.string().min(1, 'Start date is required').refine((date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(date) >= today;
  }, 'Start date must be today or in the future'),
  license_photo: z.string().min(1, 'License photo is required'),
  uber_screenshot: z.string().optional(),
  selected_amount: z.number().min(1, 'Please select an agreement amount'),
});

type ApplyValues = z.infer<typeof applySchema>;

const AGREEMENT_OPTIONS = [
  { id: 'standard', label: 'Standard Plan', weekly: 249, bond: 500, description: 'Standard Toyota Camry Hybrid' },
  { id: 'premium', label: 'Premium Plan', weekly: 299, bond: 750, description: 'Newer Model / Low KM Camry Hybrid' },
];

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
            `Pay $${amount} & Submit`
          )}
        </button>
      </div>
    </form>
  );
}

export default function Apply() {
  const [step, setStep] = useState(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeOptions, setStripeOptions] = useState<any>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid }
  } = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
    mode: 'onChange',
    defaultValues: {
      selected_amount: 249
    }
  });

  const selected_amount = watch('selected_amount');
  const license_photo = watch('license_photo');
  const uber_screenshot = watch('uber_screenshot');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'license_photo' | 'uber_screenshot') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setValue(field, reader.result as string, { shouldValidate: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: ApplyValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const appRes = await api.post('/applications', data);
      const application_id = Number(appRes.data.application_id);

      const subRes = await api.post('/create-subscription', {
        application_id,
        custom_weekly_price: data.selected_amount,
      });

      setClientSecret(subRes.data.clientSecret);
      setStripeOptions({
        clientSecret: subRes.data.clientSecret,
        appearance: {
          theme: 'night',
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
      });
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center p-6">
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-md w-full text-center"
        >
          <div className="w-24 h-24 bg-brand-gold/20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-brand-gold" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 uppercase tracking-tighter">Application Received</h1>
          <p className="text-brand-grey mb-12 font-light leading-relaxed">
            Thank you for your application. Our team will review your details and documents. 
            We'll be in touch within 24 hours via email.
          </p>
          <Link 
            to="/"
            className="inline-block bg-brand-gold text-brand-navy px-12 py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg"
          >
            Back to Home
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 min-h-screen bg-brand-navy">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Progress Steps */}
          <div className="flex justify-between mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/10 -translate-y-1/2 z-0" />
            {[
              { step: 1, label: 'Driver Details', icon: User },
              { step: 2, label: 'Documents', icon: ShieldCheck },
              { step: 3, label: 'Security Bond', icon: CreditCard }
            ].map((s) => (
              <div key={s.step} className="relative z-10 flex flex-col items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                  step >= s.step ? 'bg-brand-gold border-brand-gold text-brand-navy shadow-[0_0_20px_rgba(212,175,55,0.3)]' : 'bg-brand-navy border-white/10 text-brand-grey'
                }`}>
                  <s.icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors duration-500 ${
                  step >= s.step ? 'text-white' : 'text-brand-grey'
                }`}>{s.label}</span>
              </div>
            ))}
          </div>

          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white/5 border border-white/10 p-8 md:p-12 rounded-3xl"
          >
            <form onSubmit={handleSubmit(onSubmit)}>
              {step === 1 && (
                <div className="space-y-8">
                  <div className="mb-12">
                    <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Driver Details</h2>
                    <p className="text-brand-grey font-light">Tell us about yourself and your experience.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Full Name</label>
                      <input
                        {...register('name')}
                        className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                        placeholder="As shown on license"
                      />
                      {errors.name && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Phone Number</label>
                      <input
                        {...register('phone')}
                        className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                        placeholder="04XX XXX XXX"
                      />
                      {errors.phone && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.phone.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Email Address</label>
                      <input
                        {...register('email')}
                        className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                        placeholder="email@example.com"
                      />
                      {errors.email && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.email.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Residential Address</label>
                      <input
                        {...register('address')}
                        className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                        placeholder="Full address in NSW"
                      />
                      {errors.address && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.address.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Uber Status</label>
                      <select
                        {...register('uber_status')}
                        className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light appearance-none"
                      >
                        <option value="Active">Active Driver</option>
                        <option value="Applying">Applying</option>
                        <option value="Not Yet Registered">Not Yet Registered</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Rideshare Experience</label>
                      <select
                        {...register('experience')}
                        className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light appearance-none"
                      >
                        <option value="New Driver">New Driver</option>
                        <option value="Less than 1 year">Less than 1 year</option>
                        <option value="1-3 years">1-3 years</option>
                        <option value="3+ years">3+ years</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Intended Start Date</label>
                      <input
                        type="date"
                        {...register('intended_start_date')}
                        className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                      />
                      {errors.intended_start_date && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.intended_start_date.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Weekly Rental Plan</label>
                      <div className="grid grid-cols-2 gap-4">
                        {AGREEMENT_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setValue('selected_amount', opt.weekly)}
                            className={`p-4 rounded-xl border transition-all text-left ${
                              selected_amount === opt.weekly 
                                ? 'bg-brand-gold/10 border-brand-gold shadow-lg shadow-brand-gold/5' 
                                : 'bg-brand-navy border-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className={`text-[8px] font-bold uppercase tracking-widest ${selected_amount === opt.weekly ? 'text-brand-gold' : 'text-brand-grey'}`}>
                                {opt.label}
                              </span>
                              {selected_amount === opt.weekly && <CheckCircle2 className="w-3 h-3 text-brand-gold" />}
                            </div>
                            <div className="text-lg font-bold text-white">${opt.weekly}</div>
                            <div className="text-[8px] text-brand-grey uppercase tracking-tighter">/ per week</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-8">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="bg-brand-gold text-brand-navy px-12 py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center gap-3"
                    >
                      Next Step <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8">
                  <div className="mb-12">
                    <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Document Verification</h2>
                    <p className="text-brand-grey font-light">We need to verify your driver's license and Uber account.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">License Number</label>
                        <input
                          {...register('license_number')}
                          className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                          placeholder="NSW Driver License #"
                        />
                        {errors.license_number && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.license_number.message}</p>}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">License Expiry</label>
                        <input
                          type="date"
                          {...register('license_expiry')}
                          className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                        />
                        {errors.license_expiry && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.license_expiry.message}</p>}
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">License Photo (Front)</label>
                        <div 
                          className={`relative aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all overflow-hidden ${
                            license_photo ? 'border-brand-gold bg-brand-gold/5' : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          {license_photo ? (
                            <>
                              <img src={license_photo} alt="License Preview" className="w-full h-full object-cover" />
                              <button 
                                type="button"
                                onClick={() => setValue('license_photo', '')}
                                className="absolute top-4 right-4 bg-brand-navy/80 p-2 rounded-full text-white hover:text-red-500 backdrop-blur-md"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-10 h-10 text-brand-grey mb-4" />
                              <p className="text-xs text-brand-grey uppercase font-bold tracking-widest mb-1">Upload Photo</p>
                              <p className="text-[8px] text-brand-grey/50 uppercase tracking-tighter">JPG, PNG up to 10MB</p>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'license_photo')}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </div>
                        {errors.license_photo && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest">{errors.license_photo.message}</p>}
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Uber Account Screenshot (Optional)</label>
                        <div 
                          className={`relative aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all overflow-hidden ${
                            uber_screenshot ? 'border-brand-gold bg-brand-gold/5' : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          {uber_screenshot ? (
                            <>
                              <img src={uber_screenshot} alt="Uber Preview" className="w-full h-full object-cover" />
                              <button 
                                type="button"
                                onClick={() => setValue('uber_screenshot', '')}
                                className="absolute top-4 right-4 bg-brand-navy/80 p-2 rounded-full text-white hover:text-red-500 backdrop-blur-md"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-10 h-10 text-brand-grey mb-4" />
                              <p className="text-xs text-brand-grey uppercase font-bold tracking-widest mb-1">Upload Screenshot</p>
                              <p className="text-[8px] text-brand-grey/50 uppercase tracking-tighter">Your driver profile screen</p>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'uber_screenshot')}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-8">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 border border-white/10 text-white py-5 font-bold uppercase tracking-widest text-sm hover:bg-white/5 transition-all"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-[2] bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>Complete Documents <ChevronRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </div>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl flex gap-4 items-center">
                      <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
                      <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && clientSecret && (
                <div className="space-y-8">
                  <div className="mb-12">
                    <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Security Bond</h2>
                    <p className="text-brand-grey font-light">Secure your vehicle with a refundable security bond.</p>
                  </div>

                  <div className="bg-brand-gold/5 border border-brand-gold/20 p-8 rounded-2xl mb-8">
                    <div className="flex justify-between items-end">
                      <div>
                        <h4 className="text-brand-gold font-bold uppercase tracking-widest text-[10px] mb-2">Total Upfront</h4>
                        <div className="text-4xl font-bold text-white">${selected_amount + 500 + 10 + 2.2}</div>
                      </div>
                      <div className="text-right text-[10px] text-brand-grey uppercase tracking-widest space-y-1">
                        <p>Security Bond: $500.00</p>
                        <p>Weekly Rent: ${selected_amount}.00</p>
                        <p>Setup Fees: $12.20</p>
                      </div>
                    </div>
                  </div>

                  <Elements stripe={stripePromise} options={stripeOptions}>
                    <CheckoutForm 
                      amount={selected_amount + 500 + 10 + 2.2} 
                      onSuccess={() => setIsSuccess(true)}
                      onCancel={() => setStep(2)}
                    />
                  </Elements>
                </div>
              )}
            </form>
          </motion.div>
          
          <div className="mt-12 text-center">
            <p className="text-brand-grey text-[10px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-gold" /> SSL Secure Verification Powered by Stripe
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
