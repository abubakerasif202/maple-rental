import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  CheckCircle2,
  User,
  CreditCard,
  ChevronRight,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api, { fetchRentalPlans } from '../lib/api';
import type { RentalPlanWithPricing } from '../lib/rentalPlans';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
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
  selected_plan_id: z.string().min(1, 'Please select a rental plan'),
});

type ApplyValues = z.infer<typeof applySchema>;

interface BillingBreakdown {
  currency: string;
  upfrontDue: number;
  recurringAmount: number;
  recurringWeekly: number;
  recurringLabel: string;
  minimumRentalWeeks: number;
  bond: number;
  initialRental: number;
  setupFees: number;
  serviceFee: number;
  planId: string | null;
  planName: string | null;
}

function CheckoutForm({ amount, onSuccess, onCancel }: { amount: number; onSuccess: () => void; onCancel: () => void }) {
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
          {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : `Pay $${amount.toFixed(2)} & Submit`}
        </button>
      </div>
    </form>
  );
}

export default function Apply() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeOptions, setStripeOptions] = useState<any>(null);
  const [billingBreakdown, setBillingBreakdown] = useState<BillingBreakdown | null>(null);

  const {
    data: availablePlans = [],
    isLoading: isPlansLoading,
    isError: isPlansError,
  } = useQuery<RentalPlanWithPricing[]>({
    queryKey: ['rental-plans'],
    queryFn: fetchRentalPlans,
  });

  const {
    register,
    handleSubmit,
    setValue,
    trigger,
    watch,
    formState: { errors },
  } = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
    mode: 'onChange',
    defaultValues: {
      uber_status: 'Active',
      experience: 'New Driver',
      selected_plan_id: '',
    },
  });

  const selectedPlanId = watch('selected_plan_id');
  const licensePhoto = watch('license_photo');
  const uberScreenshot = watch('uber_screenshot');

  useEffect(() => {
    if (!availablePlans.length) return;

    const requestedPlanId = searchParams.get('planId');
    const hasRequestedPlan = requestedPlanId
      ? availablePlans.some((plan) => plan.id === requestedPlanId)
      : false;
    const fallbackPlanId = availablePlans.find((plan) => plan.popular)?.id ?? availablePlans[0].id;
    const nextPlanId = hasRequestedPlan ? requestedPlanId! : fallbackPlanId;

    if (!selectedPlanId || !availablePlans.some((plan) => plan.id === selectedPlanId)) {
      setValue('selected_plan_id', nextPlanId, { shouldValidate: true, shouldDirty: false });
      return;
    }

    if (hasRequestedPlan && selectedPlanId !== requestedPlanId) {
      setValue('selected_plan_id', requestedPlanId!, { shouldValidate: true, shouldDirty: false });
    }
  }, [availablePlans, searchParams, selectedPlanId, setValue]);

  const selectedPlan = useMemo(
    () => availablePlans.find((plan) => plan.id === selectedPlanId) ?? null,
    [availablePlans, selectedPlanId]
  );

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'license_photo' | 'uber_screenshot'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setValue(field, reader.result as string, { shouldValidate: true });
    };
    reader.readAsDataURL(file);
  };

  const goToDocumentsStep = async () => {
    const isStepOneValid = await trigger([
      'name',
      'phone',
      'email',
      'address',
      'uber_status',
      'experience',
      'intended_start_date',
      'selected_plan_id',
    ]);

    if (isStepOneValid) {
      setError(null);
      setStep(2);
    }
  };

  const onSubmit = async (data: ApplyValues) => {
    if (!selectedPlan) {
      setError('Please select a rental plan before continuing.');
      setStep(1);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { selected_plan_id, ...applicationPayload } = data;
      const appRes = await api.post('/applications', {
        ...applicationPayload,
        weekly_budget: `${selectedPlan.name} (${selectedPlan.pricing.recurringDueAud.toFixed(2)} AUD ${selectedPlan.pricing.recurringLabel})`,
      });
      const application_id = Number(appRes.data.application_id);

      const subRes = await api.post('/create-subscription', {
        application_id,
        plan_id: selected_plan_id,
      });

      setBillingBreakdown(subRes.data.billingBreakdown);
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
        <motion.div initial="hidden" animate="visible" variants={fadeIn} className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-brand-gold/20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-brand-gold" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 uppercase tracking-tighter">Application Received</h1>
          <p className="text-brand-grey mb-12 font-light leading-relaxed">
            Thank you for your application. Our team will review your details and documents. We'll be in touch within 24 hours via email.
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
          <div className="flex justify-between mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/10 -translate-y-1/2 z-0" />
            {[
              { step: 1, label: 'Driver Details', icon: User },
              { step: 2, label: 'Documents', icon: ShieldCheck },
              { step: 3, label: 'Security Bond', icon: CreditCard },
            ].map((s) => (
              <div key={s.step} className="relative z-10 flex flex-col items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                    step >= s.step
                      ? 'bg-brand-gold border-brand-gold text-brand-navy shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                      : 'bg-brand-navy border-white/10 text-brand-grey'
                  }`}
                >
                  <s.icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors duration-500 ${
                    step >= s.step ? 'text-white' : 'text-brand-grey'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white/5 border border-white/10 p-8 md:p-12 rounded-3xl"
          >
            <form onSubmit={handleSubmit(onSubmit)}>
              {step === 1 && (
                <div className="space-y-8">
                  <div className="mb-12">
                    <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Driver Details</h2>
                    <p className="text-brand-grey font-light">Tell us about yourself and choose the rental cadence you want to start with.</p>
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

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Intended Start Date</label>
                      <input
                        type="date"
                        {...register('intended_start_date')}
                        className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                      />
                      {errors.intended_start_date && (
                        <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.intended_start_date.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Rental Plan</label>
                        <p className="text-sm text-brand-grey mt-2 font-light">Your selected plan sets the actual upfront total and recurring Stripe subscription.</p>
                      </div>
                      {selectedPlan && (
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">Selected</p>
                          <p className="text-sm text-white font-semibold">{selectedPlan.name}</p>
                        </div>
                      )}
                    </div>

                    {isPlansLoading && (
                      <div className="rounded-2xl border border-white/10 bg-brand-navy p-6 flex items-center gap-3 text-brand-grey text-sm">
                        <Loader2 className="w-5 h-5 animate-spin text-brand-gold" />
                        Loading current rental plans...
                      </div>
                    )}

                    {isPlansError && (
                      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 flex items-center gap-3 text-red-400 text-sm">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        We could not load the current rental plans. Refresh and try again.
                      </div>
                    )}

                    {!isPlansLoading && !isPlansError && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {availablePlans.map((plan) => {
                          const isSelected = selectedPlanId === plan.id;

                          return (
                            <button
                              key={plan.id}
                              type="button"
                              onClick={() => setValue('selected_plan_id', plan.id, { shouldValidate: true, shouldDirty: true })}
                              className={`p-5 rounded-2xl border transition-all text-left ${
                                isSelected
                                  ? 'bg-brand-gold/10 border-brand-gold shadow-lg shadow-brand-gold/5'
                                  : 'bg-brand-navy border-white/10 hover:border-white/20'
                              }`}
                            >
                              <div className="flex justify-between items-start gap-3 mb-4">
                                <div>
                                  <p className={`text-[8px] font-bold uppercase tracking-widest ${isSelected ? 'text-brand-gold' : 'text-brand-grey'}`}>
                                    {plan.highlight}
                                  </p>
                                  <p className="text-lg font-bold text-white mt-2">{plan.name}</p>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-gold shrink-0" />}
                              </div>

                              <div className="space-y-2 mb-4">
                                <div className="text-2xl font-bold text-white">${plan.pricing.recurringDueAud.toFixed(2)}</div>
                                <div className="text-[10px] text-brand-grey uppercase tracking-widest">{plan.pricing.recurringLabel}</div>
                              </div>

                              <div className="space-y-2 text-[10px] uppercase tracking-widest text-brand-grey">
                                <p>Due now: ${plan.pricing.upfrontDueAud.toFixed(2)}</p>
                                <p>Bond: ${plan.pricing.bondAud.toFixed(2)}</p>
                                <p>Setup fees: ${plan.pricing.setupFeesAud.toFixed(2)}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {errors.selected_plan_id && (
                      <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">{errors.selected_plan_id.message}</p>
                    )}
                  </div>

                  <div className="flex justify-end pt-8">
                    <button
                      type="button"
                      onClick={goToDocumentsStep}
                      disabled={isPlansLoading || isPlansError || !selectedPlan}
                      className="bg-brand-gold text-brand-navy px-12 py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center gap-3 disabled:opacity-50"
                    >
                      Next Step <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8">
                  <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                    <div>
                      <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Document Verification</h2>
                      <p className="text-brand-grey font-light">We need to verify your driver's license and Uber account.</p>
                    </div>
                    {selectedPlan && (
                      <div className="rounded-2xl border border-brand-gold/20 bg-brand-gold/5 px-5 py-4 text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">Plan summary</p>
                        <p className="text-lg font-bold text-white">{selectedPlan.name}</p>
                        <p className="text-xs text-brand-grey mt-1">
                          ${selectedPlan.pricing.upfrontDueAud.toFixed(2)} due now, then ${selectedPlan.pricing.recurringDueAud.toFixed(2)} {selectedPlan.pricing.recurringLabel}
                        </p>
                      </div>
                    )}
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
                            licensePhoto ? 'border-brand-gold bg-brand-gold/5' : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          {licensePhoto ? (
                            <>
                              <img src={licensePhoto} alt="License Preview" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setValue('license_photo', '', { shouldValidate: true })}
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
                            uberScreenshot ? 'border-brand-gold bg-brand-gold/5' : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          {uberScreenshot ? (
                            <>
                              <img src={uberScreenshot} alt="Uber Preview" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setValue('uber_screenshot', '', { shouldValidate: true })}
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
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Review Payment <ChevronRight className="w-4 h-4" /></>}
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

              {step === 3 && clientSecret && billingBreakdown && (
                <div className="space-y-8">
                  <div className="mb-12">
                    <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Security Bond</h2>
                    <p className="text-brand-grey font-light">
                      Finalize your {billingBreakdown.planName ?? selectedPlan?.name ?? 'selected'} plan and confirm the upfront payment.
                    </p>
                  </div>

                  <div className="bg-brand-gold/5 border border-brand-gold/20 p-8 rounded-2xl mb-8">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                      <div>
                        <h4 className="text-brand-gold font-bold uppercase tracking-widest text-[10px] mb-2">Total Upfront</h4>
                        <div className="text-4xl font-bold text-white">${billingBreakdown.upfrontDue.toFixed(2)}</div>
                        <p className="text-brand-grey text-xs mt-3">
                          Recurring charge after activation: ${billingBreakdown.recurringAmount.toFixed(2)} {billingBreakdown.recurringLabel}
                        </p>
                      </div>
                      <div className="text-right text-[10px] text-brand-grey uppercase tracking-widest space-y-1">
                        <p>Security Bond: ${billingBreakdown.bond.toFixed(2)}</p>
                        <p>Initial Rental: ${billingBreakdown.initialRental.toFixed(2)}</p>
                        <p>Setup Fees: ${billingBreakdown.setupFees.toFixed(2)}</p>
                        <p>Service Fee Each Cycle: ${billingBreakdown.serviceFee.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <Elements stripe={stripePromise} options={stripeOptions}>
                    <CheckoutForm amount={billingBreakdown.upfrontDue} onSuccess={() => setIsSuccess(true)} onCancel={() => setStep(2)} />
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
