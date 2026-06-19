import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck, Upload, User, CarFront, FileText } from 'lucide-react';
import * as z from 'zod';
import Seo from '../components/Seo';
import { submitApplication } from '../lib/api';
import { getApiErrorMessage } from '../lib/errorHandling';
import {
  APPLICATION_DOCUMENT_CONTENT_TYPES,
  APPLICATION_IMAGE_CONTENT_TYPES,
  AUSTRALIAN_MOBILE_REGEX,
  MAX_APPLICATION_UPLOAD_BYTES,
  getTodayInAustralia,
  isTodayOrFutureAustraliaDate,
  isFutureAustraliaDate,
  isValidDateOnly,
  normalizeApplicationEmail,
  normalizeAustralianMobile,
} from '../../shared/applicationSubmission';

const MAX_UPLOAD_SIZE_MB = Math.floor(MAX_APPLICATION_UPLOAD_BYTES / (1024 * 1024));

const requiredDate = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(isValidDateOnly, `${label} must be a valid date`);

const applicationSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required'),
  date_of_birth: requiredDate('Date of birth'),
  phone: z
    .string()
    .transform(normalizeAustralianMobile)
    .pipe(z.string().regex(AUSTRALIAN_MOBILE_REGEX, 'Valid Australian mobile number required')),
  email: z
    .string()
    .transform(normalizeApplicationEmail)
    .pipe(z.string().email('Invalid email address')),
  address: z.string().trim().min(5, 'Residential address is required'),
  licence_state: z.string().trim().min(1, 'Licence state is required'),
  license_number: z.string().trim().min(5, 'Licence number is required'),
  license_expiry: requiredDate('Licence expiry').refine(
    (value) => isFutureAustraliaDate(value, getTodayInAustralia()),
    'Licence must not be expired',
  ),
  uber_status: z.enum(['Active', 'Applying', 'Not Yet Registered']),
  experience: z.enum(['New Driver', 'Less than 1 year', '1-3 years', '3+ years']),
  preferred_vehicle: z.string().trim().optional().transform((value) => value || ''),
  preferred_category: z.enum(['Economy', 'SUV', 'Luxury', 'People Mover']).optional(),
  intended_start_date: requiredDate('Preferred start date').refine(
    (value) => isTodayOrFutureAustraliaDate(value, getTodayInAustralia()),
    'Start date must be today or later',
  ),
  weekly_budget: z.string().trim().optional().transform((value) => value || ''),
  rental_duration_weeks: z
    .preprocess((value) => (value === '' || value == null ? undefined : value), z.coerce.number().int().positive().optional())
    .optional(),
  driving_history_notes: z.string().trim().optional().transform((value) => value || ''),
  rental_notes: z.string().trim().optional().transform((value) => value || ''),
  agreement_accepted: z.boolean().refine((value) => value, 'You must accept the rental agreement'),
  agreement_signature: z.string().trim().min(2, 'Signature is required'),
});

const requiredImageSchema = z
  .custom<File>((value) => value instanceof File, { message: 'File is required' })
  .refine((file) => APPLICATION_IMAGE_CONTENT_TYPES.includes(file.type as (typeof APPLICATION_IMAGE_CONTENT_TYPES)[number]), 'Please upload a JPG or PNG')
  .refine((file) => file.size <= MAX_APPLICATION_UPLOAD_BYTES, `Please upload a file smaller than ${MAX_UPLOAD_SIZE_MB} MB`);

const requiredDocumentSchema = z
  .custom<File>((value) => value instanceof File, { message: 'File is required' })
  .refine((file) => APPLICATION_DOCUMENT_CONTENT_TYPES.includes(file.type as (typeof APPLICATION_DOCUMENT_CONTENT_TYPES)[number]), 'Please upload a JPG, PNG, or PDF')
  .refine((file) => file.size <= MAX_APPLICATION_UPLOAD_BYTES, `Please upload a file smaller than ${MAX_UPLOAD_SIZE_MB} MB`);

type FormState = z.input<typeof applicationSchema> & {
  license_photo: File | null;
  license_back_photo: File | null;
  proof_of_address_document: File | null;
  additional_document: File | null;
};

const initialState: FormState = {
  name: '',
  date_of_birth: '',
  phone: '',
  email: '',
  address: '',
  licence_state: 'NSW',
  license_number: '',
  license_expiry: '',
  uber_status: 'Active',
  experience: 'New Driver',
  preferred_vehicle: '',
  preferred_category: 'Economy',
  intended_start_date: '',
  weekly_budget: '',
  rental_duration_weeks: 4,
  driving_history_notes: '',
  rental_notes: '',
  agreement_accepted: false,
  agreement_signature: '',
  license_photo: null,
  license_back_photo: null,
  proof_of_address_document: null,
  additional_document: null,
};

const steps = [
  { id: 1, label: 'Personal' },
  { id: 2, label: 'Driver' },
  { id: 3, label: 'Preference' },
  { id: 4, label: 'Documents' },
  { id: 5, label: 'Review' },
] as const;

const fieldClass =
  'w-full rounded-2xl border border-white/10 bg-brand-navy px-5 py-4 text-white outline-none placeholder:text-brand-grey/60 focus:border-brand-gold';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] font-semibold text-red-300">{message}</p>;
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.16)] sm:p-8">
      <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-brand-grey">{description}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

export default function Apply() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedApplicationId, setSubmittedApplicationId] = useState<string | null>(null);

  const stepSchema = useMemo(() => {
    switch (step) {
      case 1:
        return applicationSchema.pick({
          name: true,
          date_of_birth: true,
          phone: true,
          email: true,
          address: true,
        });
      case 2:
        return applicationSchema.pick({
          licence_state: true,
          license_number: true,
          license_expiry: true,
          uber_status: true,
          experience: true,
        });
      case 3:
        return applicationSchema.pick({
          preferred_vehicle: true,
          preferred_category: true,
          intended_start_date: true,
          weekly_budget: true,
          rental_duration_weeks: true,
          driving_history_notes: true,
          rental_notes: true,
        });
      case 5:
        return applicationSchema.pick({
          agreement_accepted: true,
          agreement_signature: true,
        });
      default:
        return null;
    }
  }, [step]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const validateStep = () => {
    const nextErrors: Record<string, string> = {};

    if (stepSchema) {
      const result = stepSchema.safeParse(form);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          nextErrors[key] = issue.message;
        }
      }
    }

    if (step === 4) {
      const fileChecks = {
        license_photo: requiredImageSchema.safeParse(form.license_photo),
        license_back_photo: requiredImageSchema.safeParse(form.license_back_photo),
        proof_of_address_document: requiredDocumentSchema.safeParse(form.proof_of_address_document),
      } as const;

      for (const [key, result] of Object.entries(fileChecks)) {
        if (!result.success) {
          nextErrors[key] = result.error.issues[0]?.message || 'File is required';
        }
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleFileChange = (
    event: ChangeEvent<HTMLInputElement>,
    field: 'license_photo' | 'license_back_photo' | 'proof_of_address_document' | 'additional_document',
    kind: 'image' | 'document',
  ) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setField(field, null);
      return;
    }

    const allowedTypes =
      kind === 'image' ? APPLICATION_IMAGE_CONTENT_TYPES : APPLICATION_DOCUMENT_CONTENT_TYPES;
    const isAllowedType =
      kind === 'image'
        ? APPLICATION_IMAGE_CONTENT_TYPES.includes(file.type as (typeof APPLICATION_IMAGE_CONTENT_TYPES)[number])
        : APPLICATION_DOCUMENT_CONTENT_TYPES.includes(file.type as (typeof APPLICATION_DOCUMENT_CONTENT_TYPES)[number]);
    if (!isAllowedType || file.size > MAX_APPLICATION_UPLOAD_BYTES) {
      event.target.value = '';
      setErrors((current) => ({
        ...current,
        [field]:
          kind === 'image'
            ? `Please upload a JPG or PNG smaller than ${MAX_UPLOAD_SIZE_MB} MB.`
            : `Please upload a JPG, PNG, or PDF smaller than ${MAX_UPLOAD_SIZE_MB} MB.`,
      }));
      return;
    }

    setField(field, file);
  };

  const handleNext = () => {
    if (!validateStep()) {
      return;
    }

    setStep((current) => Math.min(current + 1, 5));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateStep()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const finalCheck = applicationSchema.safeParse(form);
      if (!finalCheck.success) {
        const nextErrors: Record<string, string> = {};
        for (const issue of finalCheck.error.issues) {
          nextErrors[String(issue.path[0] ?? 'form')] = issue.message;
        }
        setErrors(nextErrors);
        setIsSubmitting(false);
        return;
      }

      if (!form.license_photo || !form.license_back_photo || !form.proof_of_address_document) {
        setErrors((current) => ({
          ...current,
          form: 'Please attach all required documents before submitting.',
        }));
        setIsSubmitting(false);
        return;
      }

      const payload = new FormData();
      payload.set('name', finalCheck.data.name);
      payload.set('date_of_birth', finalCheck.data.date_of_birth);
      payload.set('phone', finalCheck.data.phone);
      payload.set('email', finalCheck.data.email);
      payload.set('address', finalCheck.data.address);
      payload.set('licence_state', finalCheck.data.licence_state);
      payload.set('license_number', finalCheck.data.license_number);
      payload.set('license_expiry', finalCheck.data.license_expiry);
      payload.set('uber_status', finalCheck.data.uber_status);
      payload.set('experience', finalCheck.data.experience);
      payload.set('preferred_vehicle', finalCheck.data.preferred_vehicle || '');
      payload.set('preferred_category', finalCheck.data.preferred_category || '');
      payload.set('intended_start_date', finalCheck.data.intended_start_date);
      payload.set('weekly_budget', finalCheck.data.weekly_budget || '');
      payload.set('rental_duration_weeks', String(finalCheck.data.rental_duration_weeks || ''));
      payload.set('driving_history_notes', finalCheck.data.driving_history_notes || '');
      payload.set('rental_notes', finalCheck.data.rental_notes || '');
      payload.set('agreement_accepted', 'true');
      payload.set('agreement_signature', finalCheck.data.agreement_signature.trim());
      payload.set('license_photo', form.license_photo);
      payload.set('license_back_photo', form.license_back_photo);
      payload.set('passport_or_uber_profile_screenshot', form.proof_of_address_document);
      payload.set('proof_of_address_document', form.proof_of_address_document);
      if (form.additional_document) {
        payload.set('additional_document', form.additional_document);
      }

      const response = await submitApplication(payload);
      setSubmittedApplicationId(response.application_id);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        form: getApiErrorMessage(error, 'Failed to save your application.'),
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedApplicationId) {
    return (
      <div className="min-h-screen bg-brand-navy text-white">
        <Seo
          title="Application Received | Gala Rentals"
          description="Gala Rentals application confirmation screen."
          canonicalPath="/apply"
          robots="noindex,nofollow"
        />
        <div className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-16">
          <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-gold/20 bg-brand-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-gold">
              <CheckCircle2 className="h-4 w-4" />
              Application received
            </div>
            <h1 className="mt-6 text-4xl font-serif font-bold">Review in progress</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-brand-grey">
              Your application was saved successfully. We will review the details, confirm the vehicle,
              and issue a secure Stripe payment link if you are approved.
            </p>
            <div className="mt-8 rounded-3xl border border-white/10 bg-brand-navy/60 p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">Reference</p>
              <p className="mt-2 text-lg font-semibold text-white">Application #{submittedApplicationId}</p>
            </div>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-7 py-4 text-xs font-bold uppercase tracking-[0.24em] text-brand-navy"
              >
                Return Home
              </Link>
              <Link
                to="/my-rental"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-7 py-4 text-xs font-bold uppercase tracking-[0.24em] text-white"
              >
                My Rental
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-navy text-white">
      <Seo
        title="Apply | Gala Rentals"
        description="Apply for a premium Gala Rentals subscription in five clear steps."
        canonicalPath="/apply"
      />

      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="lg:sticky lg:top-28">
            <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">Apply now</p>
            <h1 className="mt-5 text-5xl font-serif font-bold tracking-tight sm:text-6xl">
              Premium rental approvals, organized in five steps.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-stone-300">
              Gala Rentals keeps the experience calm and professional. Submit your details, upload documents,
              and accept the agreement before the admin review begins.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              {['Validated by Zod', 'Admin reviewed', 'Stripe-ready'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-grey">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-gold" />
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-10 flex items-center gap-3">
              {steps.map((item) => (
                <div
                  key={item.id}
                  className={[
                    'flex h-11 w-11 items-center justify-center rounded-full border text-[12px] font-bold',
                    step >= item.id ? 'border-brand-gold bg-brand-gold text-brand-navy' : 'border-white/10 bg-white/[0.03] text-brand-grey',
                  ].join(' ')}
                >
                  {item.id}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.form && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-50">
                {errors.form}
              </div>
            )}

            {step === 1 && (
              <Section eyebrow="Step 1" title="Personal details" description="Tell us who you are and how we can reach you.">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <input
                      value={form.name}
                      onChange={(event) => setField('name', event.target.value)}
                      placeholder="Full name"
                      className={fieldClass}
                    />
                    <FieldError message={errors.name} />
                  </div>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(event) => setField('date_of_birth', event.target.value)}
                      className={fieldClass}
                    />
                    <FieldError message={errors.date_of_birth} />
                  </div>
                  <div className="space-y-2">
                    <input
                      value={form.phone}
                      onChange={(event) => setField('phone', event.target.value)}
                      placeholder="Mobile number"
                      className={fieldClass}
                    />
                    <FieldError message={errors.phone} />
                  </div>
                  <div className="space-y-2">
                    <input
                      value={form.email}
                      onChange={(event) => setField('email', event.target.value)}
                      placeholder="Email address"
                      className={fieldClass}
                    />
                    <FieldError message={errors.email} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <textarea
                      value={form.address}
                      onChange={(event) => setField('address', event.target.value)}
                      placeholder="Residential address"
                      rows={3}
                      className={fieldClass}
                    />
                    <FieldError message={errors.address} />
                  </div>
                </div>
              </Section>
            )}

            {step === 2 && (
              <Section eyebrow="Step 2" title="Driver details" description="We review licence and driving history details before approval.">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <select
                      value={form.licence_state}
                      onChange={(event) => setField('licence_state', event.target.value)}
                      className={fieldClass}
                    >
                      <option value="NSW">NSW</option>
                      <option value="VIC">VIC</option>
                      <option value="QLD">QLD</option>
                      <option value="SA">SA</option>
                      <option value="WA">WA</option>
                      <option value="TAS">TAS</option>
                      <option value="ACT">ACT</option>
                      <option value="NT">NT</option>
                    </select>
                    <FieldError message={errors.licence_state} />
                  </div>
                  <div className="space-y-2">
                    <input
                      value={form.license_number}
                      onChange={(event) => setField('license_number', event.target.value)}
                      placeholder="Licence number"
                      className={fieldClass}
                    />
                    <FieldError message={errors.license_number} />
                  </div>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={form.license_expiry}
                      onChange={(event) => setField('license_expiry', event.target.value)}
                      className={fieldClass}
                    />
                    <FieldError message={errors.license_expiry} />
                  </div>
                  <div className="space-y-2">
                    <select
                      value={form.uber_status}
                      onChange={(event) => setField('uber_status', event.target.value as FormState['uber_status'])}
                      className={fieldClass}
                    >
                      <option value="Active">Active</option>
                      <option value="Applying">Applying</option>
                      <option value="Not Yet Registered">Not Yet Registered</option>
                    </select>
                    <FieldError message={errors.uber_status} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <select
                      value={form.experience}
                      onChange={(event) => setField('experience', event.target.value as FormState['experience'])}
                      className={fieldClass}
                    >
                      <option value="New Driver">New Driver</option>
                      <option value="Less than 1 year">Less than 1 year</option>
                      <option value="1-3 years">1-3 years</option>
                      <option value="3+ years">3+ years</option>
                    </select>
                    <FieldError message={errors.experience} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <textarea
                      value={form.driving_history_notes}
                      onChange={(event) => setField('driving_history_notes', event.target.value)}
                      placeholder="Driving history notes"
                      rows={3}
                      className={fieldClass}
                    />
                  </div>
                </div>
              </Section>
            )}

            {step === 3 && (
              <Section eyebrow="Step 3" title="Rental preference" description="Tell us what you are looking for and when you want to start.">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <select
                      value={form.preferred_category || 'Economy'}
                      onChange={(event) => setField('preferred_category', event.target.value as FormState['preferred_category'])}
                      className={fieldClass}
                    >
                      <option value="Economy">Economy</option>
                      <option value="SUV">SUV</option>
                      <option value="Luxury">Luxury</option>
                      <option value="People Mover">People Mover</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <input
                      value={form.preferred_vehicle}
                      onChange={(event) => setField('preferred_vehicle', event.target.value)}
                      placeholder="Preferred vehicle"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={form.intended_start_date}
                      onChange={(event) => setField('intended_start_date', event.target.value)}
                      className={fieldClass}
                    />
                    <FieldError message={errors.intended_start_date} />
                  </div>
                  <div className="space-y-2">
                    <input
                      value={form.weekly_budget}
                      onChange={(event) => setField('weekly_budget', event.target.value)}
                      placeholder="Weekly budget"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <input
                      type="number"
                      min="1"
                      value={
                        typeof form.rental_duration_weeks === 'number'
                          ? form.rental_duration_weeks
                          : ''
                      }
                      onChange={(event) =>
                        setField(
                          'rental_duration_weeks',
                          event.target.value ? Number(event.target.value) : undefined
                        )
                      }
                      placeholder="Rental duration in weeks"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <textarea
                      value={form.rental_notes}
                      onChange={(event) => setField('rental_notes', event.target.value)}
                      rows={4}
                      placeholder="Any rental notes"
                      className={fieldClass}
                    />
                  </div>
                </div>
              </Section>
            )}

            {step === 4 && (
              <Section eyebrow="Step 4" title="Documents" description="Upload clear copies so review can move quickly.">
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <Upload className="h-5 w-5 text-brand-gold" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">Licence front</p>
                        <p className="text-sm text-brand-grey">{form.license_photo ? form.license_photo.name : 'JPG or PNG'}</p>
                      </div>
                    </div>
                    <input type="file" accept={APPLICATION_IMAGE_CONTENT_TYPES.join(',')} onChange={(event) => handleFileChange(event, 'license_photo', 'image')} className="mt-4 w-full text-sm text-brand-grey file:mr-4 file:rounded-full file:border-0 file:bg-brand-gold file:px-4 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.2em] file:text-brand-navy" />
                    <FieldError message={errors.license_photo} />
                  </label>

                  <label className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <Upload className="h-5 w-5 text-brand-gold" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">Licence back</p>
                        <p className="text-sm text-brand-grey">{form.license_back_photo ? form.license_back_photo.name : 'JPG or PNG'}</p>
                      </div>
                    </div>
                    <input type="file" accept={APPLICATION_IMAGE_CONTENT_TYPES.join(',')} onChange={(event) => handleFileChange(event, 'license_back_photo', 'image')} className="mt-4 w-full text-sm text-brand-grey file:mr-4 file:rounded-full file:border-0 file:bg-brand-gold file:px-4 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.2em] file:text-brand-navy" />
                    <FieldError message={errors.license_back_photo} />
                  </label>

                  <label className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-brand-gold" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">Proof of address</p>
                        <p className="text-sm text-brand-grey">{form.proof_of_address_document ? form.proof_of_address_document.name : 'JPG, PNG, or PDF'}</p>
                      </div>
                    </div>
                    <input type="file" accept={APPLICATION_DOCUMENT_CONTENT_TYPES.join(',')} onChange={(event) => handleFileChange(event, 'proof_of_address_document', 'document')} className="mt-4 w-full text-sm text-brand-grey file:mr-4 file:rounded-full file:border-0 file:bg-brand-gold file:px-4 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.2em] file:text-brand-navy" />
                    <FieldError message={errors.proof_of_address_document} />
                  </label>

                  <label className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-brand-gold" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">Additional document</p>
                        <p className="text-sm text-brand-grey">{form.additional_document ? form.additional_document.name : 'Optional'}</p>
                      </div>
                    </div>
                    <input type="file" accept={APPLICATION_DOCUMENT_CONTENT_TYPES.join(',')} onChange={(event) => handleFileChange(event, 'additional_document', 'document')} className="mt-4 w-full text-sm text-brand-grey file:mr-4 file:rounded-full file:border-0 file:bg-brand-gold file:px-4 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.2em] file:text-brand-navy" />
                  </label>
                </div>
              </Section>
            )}

            {step === 5 && (
              <Section eyebrow="Step 5" title="Review and submit" description="Check the summary, accept the agreement, and submit when ready.">
                <div className="grid gap-5">
                  <div className="rounded-3xl border border-white/10 bg-brand-navy/60 p-5 text-sm leading-7 text-brand-grey">
                    <p className="font-semibold text-white">Summary</p>
                    <p>Name: {form.name || 'Not set'}</p>
                    <p>Preferred category: {form.preferred_category || 'Economy'}</p>
                    <p>Start date: {form.intended_start_date || 'Not set'}</p>
                    <p>Weekly budget: {form.weekly_budget || 'Not set'}</p>
                  </div>

                  <label className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <input
                      type="checkbox"
                      checked={Boolean(form.agreement_accepted)}
                      onChange={(event) => setField('agreement_accepted', event.target.checked)}
                      className="mt-1 h-5 w-5 rounded border-white/20 bg-brand-navy text-brand-gold"
                    />
                    <span className="text-sm leading-7 text-white">
                      I have read and agree to the rental agreement and the review process.
                    </span>
                  </label>
                  <FieldError message={errors.agreement_accepted} />

                  <div className="space-y-2">
                    <input
                      value={form.agreement_signature}
                      onChange={(event) => setField('agreement_signature', event.target.value)}
                      placeholder="Typed signature"
                      className={fieldClass}
                    />
                    <FieldError message={errors.agreement_signature} />
                  </div>
                </div>
              </Section>
            )}

            <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((current) => Math.max(current - 1, 1))}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-7 py-4 text-xs font-bold uppercase tracking-[0.24em] text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <span />
              )}

              {step < 5 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-7 py-4 text-xs font-bold uppercase tracking-[0.24em] text-brand-navy"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-7 py-4 text-xs font-bold uppercase tracking-[0.24em] text-brand-navy disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {isSubmitting ? 'Submitting' : 'Submit application'}
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
