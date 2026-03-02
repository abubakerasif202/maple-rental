import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, CheckCircle2, User, CreditCard, ChevronRight, X, AlertCircle, Loader2, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
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
  licenseNumber: z.string().min(5, 'License number is required'),
  licenseExpiry: z.string().min(1, 'License expiry date is required').refine((date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(date) > today;
  }, 'License must not be expired'),
  uberStatus: z.enum(['Active', 'Applying', 'Not Yet Registered']),
  experience: z.string().min(1, 'Experience is required'),
  weeklyBudget: z.string().optional(),
  intendedStartDate: z.string().min(1, 'Start date is required').refine((date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(date) >= today;
  }, 'Start date must be today or in the future'),
  licensePhoto: z.string().min(1, 'License photo is required'),
  uberScreenshot: z.string().optional().nullable(),
  selectedAmount: z.number().min(1, 'Please select an agreement amount'),
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
  const [step, setStep] = useState<'details' | 'payment'>('details');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [licensePreview, setLicensePreview] = useState<string | null>(null);
  const [uberPreview, setUberPreview] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [formData, setFormData] = useState<ApplyValues | null>(null);
  const [stripeFees, setStripeFees] = useState({ setup: 12.2 }); // Fallback

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      uberStatus: 'Not Yet Registered',
      weeklyBudget: '$250 - $300',
      selectedAmount: 249,
    }
  });

  const selectedAmount = watch('selectedAmount');
  const selectedOption = AGREEMENT_OPTIONS.find(opt => opt.weekly === selectedAmount) || AGREEMENT_OPTIONS[0];
  const upfrontTotal = selectedOption.weekly + selectedOption.bond + stripeFees.setup;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'licensePhoto' | 'uberScreenshot') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setValue(field, base64, { shouldValidate: true });
        if (field === 'licensePhoto') setLicensePreview(base64);
        if (field === 'uberScreenshot') setUberPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = (field: 'licensePhoto' | 'uberScreenshot') => {
    setValue(field, field === 'licensePhoto' ? '' : null, { shouldValidate: true });
    if (field === 'licensePhoto') setLicensePreview(null);
    if (field === 'uberScreenshot') setUberPreview(null);
  };

  const onDetailsSubmit = async (data: ApplyValues) => {
    setSubmissionError(null);
    setFormData(data);
    
    try {
      // First, create the application to get an ID
      const appRes = await api.post('/applications', data);
      const applicationId = appRes.data.id;

      // Then, create subscription session
      const subRes = await api.post('/create-subscription', {
        applicationId,
        customWeeklyPrice: data.selectedAmount,
        customBond: selectedOption.bond,
      });

      setClientSecret(subRes.data.clientSecret);
      setStep('payment');
      window.scrollTo(0, 0);
    } catch (error: any) {
      console.error('Error initiating application:', error);
      setSubmissionError(error.response?.data?.error || 'Failed to process application details. Please try again.');
      window.scrollTo(0, 0);
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
          <h1 className="text-3xl font-serif font-bold text-white mb-4 tracking-tight">Application & Payment Received</h1>
          <p className="text-brand-grey font-light leading-relaxed mb-10">
            Thank you for choosing Maple Rentals. Your application and initial payment have been received. Our team will contact you within 24 hours to arrange vehicle collection.
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
            {step === 'details' ? 'Driver Application' : 'Secure Payment'}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-brand-grey text-lg font-light mb-6"
          >
            {step === 'details' 
              ? 'Complete your application and select your rental plan.' 
              : 'Provide your payment details to confirm your application and secure your vehicle.'}
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-2 text-brand-gold text-xs font-medium uppercase tracking-widest"
          >
            <ShieldCheck className="w-4 h-4" />
            Secure SSL Encryption. All information confidential.
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-brand-navy-light border border-white/10 shadow-2xl overflow-hidden"
        >
          {submissionError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-500/10 border-b border-red-500/50 p-6 flex items-start gap-4"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-grow">
                <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest mb-1">Error</h3>
                <p className="text-sm text-red-400/80 font-light">{submissionError}</p>
              </div>
              <button onClick={() => setSubmissionError(null)} className="text-red-500/50 hover:text-red-500">
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {step === 'details' ? (
              <motion.form 
                key="details-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleSubmit(onDetailsSubmit)} 
                className="p-8 md:p-12 space-y-12"
              >
                {/* Personal Details */}
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

                {/* Agreement Selection */}
                <motion.section variants={fadeIn} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                  <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/10">
                    <DollarSign className="w-5 h-5 text-brand-gold" />
                    <h2 className="text-xl font-serif font-bold text-white tracking-tight">Rental Plan Selection</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {AGREEMENT_OPTIONS.map((option) => (
                      <label 
                        key={option.id} 
                        className={`relative p-6 border transition-all cursor-pointer flex flex-col justify-between min-h-[160px] ${
                          selectedAmount === option.weekly 
                            ? 'bg-brand-gold/10 border-brand-gold' 
                            : 'bg-brand-navy border-white/10 hover:border-white/30'
                        }`}
                      >
                        <input 
                          type="radio" 
                          {...register('selectedAmount', { valueAsNumber: true })} 
                          value={option.weekly} 
                          className="hidden" 
                        />
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-white uppercase tracking-widest text-xs">{option.label}</h3>
                            {selectedAmount === option.weekly && <CheckCircle2 className="w-4 h-4 text-brand-gold" />}
                          </div>
                          <p className="text-brand-grey text-[10px] font-light mb-4">{option.description}</p>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[8px] text-brand-grey uppercase tracking-widest mb-1">Weekly Rate</p>
                            <p className="text-2xl font-bold text-white">${option.weekly}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] text-brand-grey uppercase tracking-widest mb-1">Security Bond</p>
                            <p className="text-lg font-bold text-brand-gold">${option.bond}</p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-6 p-4 bg-brand-navy/50 border border-white/5">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                      <span className="text-brand-grey">Total Upfront Due:</span>
                      <span className="text-brand-gold text-lg">${upfrontTotal}</span>
                    </div>
                    <p className="text-[8px] text-brand-grey/50 mt-1">Includes Weekly Rent + Bond + Administrative Fees ($12.20)</p>
                  </div>
                </motion.section>

                {/* Driver Info */}
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

                {/* Documents */}
                <motion.section variants={fadeIn} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                  <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/10">
                    <ShieldCheck className="w-5 h-5 text-brand-gold" />
                    <h2 className="text-xl font-serif font-bold text-white tracking-tight">Required Documents</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest block mb-2">Driver License Photo</label>
                      {!licensePreview ? (
                        <label className="flex items-center justify-center w-full h-32 px-4 transition border-2 border-white/10 border-dashed rounded-lg appearance-none cursor-pointer hover:border-brand-gold hover:bg-white/5 bg-brand-navy">
                          <span className="flex items-center space-x-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-brand-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span className="font-medium text-brand-grey text-sm">Upload Photo</span>
                          </span>
                          <input type="file" name="file_upload" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'licensePhoto')} />
                        </label>
                      ) : (
                        <div className="relative group">
                          <img src={licensePreview} alt="License Preview" className="w-full h-32 object-cover rounded-lg border border-brand-gold/30 shadow-lg" />
                          <button
                            type="button"
                            onClick={() => removeFile('licensePhoto')}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {errors.licensePhoto && <p className="text-red-500 text-[10px]">{errors.licensePhoto.message}</p>}
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest block mb-2">Uber Profile Screenshot</label>
                      {!uberPreview ? (
                        <label className="flex items-center justify-center w-full h-32 px-4 transition border-2 border-white/10 border-dashed rounded-lg appearance-none cursor-pointer hover:border-brand-gold hover:bg-white/5 bg-brand-navy">
                          <span className="flex items-center space-x-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-brand-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span className="font-medium text-brand-grey text-sm">Upload Screenshot</span>
                          </span>
                          <input type="file" name="file_upload" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'uberScreenshot')} />
                        </label>
                      ) : (
                        <div className="relative group">
                          <img src={uberPreview} alt="Uber Preview" className="w-full h-32 object-cover rounded-lg border border-brand-gold/30 shadow-lg" />
                          <button
                            type="button"
                            onClick={() => removeFile('uberScreenshot')}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {errors.uberScreenshot && <p className="text-red-500 text-[10px]">{errors.uberScreenshot.message}</p>}
                    </div>
                  </div>
                </motion.section>

                <div className="pt-8">
                  <button disabled={isSubmitting} type="submit" className="w-full bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-12 py-5 font-bold text-sm uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Continue to Payment
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.div 
                key="payment-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 md:p-12"
              >
                <div className="mb-10 pb-10 border-b border-white/10 flex justify-between items-end">
                  <div>
                    <p className="text-brand-grey text-[10px] font-bold uppercase tracking-widest mb-2">Selected Plan</p>
                    <h2 className="text-2xl font-serif font-bold text-white">{selectedOption.label}</h2>
                    <p className="text-xs text-brand-grey mt-2">
                      Weekly: ${selectedOption.weekly} • Bond: ${selectedOption.bond} (Refundable)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-brand-grey text-[10px] font-bold uppercase tracking-widest mb-2">Total Upfront</p>
                    <p className="text-3xl font-bold text-brand-gold">${upfrontTotal}</p>
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
                    <CheckoutForm 
                      amount={upfrontTotal} 
                      onSuccess={() => setIsSubmitted(true)}
                      onCancel={() => setStep('details')}
                    />
                  </Elements>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 animate-spin text-brand-gold mb-4" />
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest font-bold">Initializing Secure Checkout</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
