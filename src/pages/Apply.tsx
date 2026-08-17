import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, type Variants } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Upload,
  User,
} from "lucide-react";
import { Link } from "../lib/router";
import { useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Seo from "../components/Seo";
import {
  fetchApplicationAgreementTemplate,
  submitApplication,
} from "../lib/api";
import { getApiErrorMessage } from "../lib/errorHandling";
import {
  APPLICATION_DOCUMENT_CONTENT_TYPES,
  APPLICATION_IMAGE_CONTENT_TYPES,
  AUSTRALIAN_MOBILE_REGEX,
  MAX_APPLICATION_UPLOAD_BYTES,
  getTodayInAustralia,
  isFutureAustraliaDate,
  isTodayOrFutureAustraliaDate,
  isValidDateOnly,
  normalizeApplicationEmail,
  normalizeAustralianMobile,
} from "../../shared/applicationSubmission";

const ALLOWED_IMAGE_UPLOAD_TYPES = new Set<string>(APPLICATION_IMAGE_CONTENT_TYPES);
const ALLOWED_DOCUMENT_UPLOAD_TYPES = new Set<string>(
  APPLICATION_DOCUMENT_CONTENT_TYPES,
);
const MAX_UPLOAD_SIZE_MB = Math.floor(
  MAX_APPLICATION_UPLOAD_BYTES / (1024 * 1024),
);

const heroVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, x: 18 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: "easeOut" },
  },
};

const dateOnlySchema = (requiredMessage: string, invalidMessage: string) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .refine(isValidDateOnly, invalidMessage);

const applicationFileSchema = (label: string) =>
  z
    .instanceof(File)
    .nullable()
    .pipe(z.instanceof(File, { error: `${label} is required` }))
    .refine(
      (file) => ALLOWED_IMAGE_UPLOAD_TYPES.has(file.type),
      `Please upload a JPG or PNG smaller than ${MAX_UPLOAD_SIZE_MB} MB.`,
    )
    .refine(
      (file) => file.size <= MAX_APPLICATION_UPLOAD_BYTES,
      `Please upload a JPG or PNG smaller than ${MAX_UPLOAD_SIZE_MB} MB.`,
    );

const applicationDocumentFileSchema = (label: string) =>
  z
    .instanceof(File)
    .nullable()
    .pipe(z.instanceof(File, { error: `${label} is required` }))
    .refine(
      (file) => ALLOWED_DOCUMENT_UPLOAD_TYPES.has(file.type),
      `Please upload a JPG, PNG, or PDF smaller than ${MAX_UPLOAD_SIZE_MB} MB.`,
    )
    .refine(
      (file) => file.size <= MAX_APPLICATION_UPLOAD_BYTES,
      `Please upload a JPG, PNG, or PDF smaller than ${MAX_UPLOAD_SIZE_MB} MB.`,
    );

const applySchema = z.object({
  name: z.string().trim().min(2, "Full name is required"),
  phone: z
    .string()
    .transform(normalizeAustralianMobile)
    .pipe(
      z
        .string()
        .regex(
          AUSTRALIAN_MOBILE_REGEX,
          "Valid Australian mobile number required",
        ),
    ),
  email: z
    .string()
    .transform(normalizeApplicationEmail)
    .pipe(z.string().email("Invalid email address")),
  address: z.string().trim().min(5, "Residential address is required"),
  license_number: z.string().trim().min(5, "License number is required"),
  license_expiry: dateOnlySchema(
    "License expiry date is required",
    "License expiry date must be a valid date",
  ).refine(
    (value) => isFutureAustraliaDate(value, getTodayInAustralia()),
    "License must not be expired",
  ),
  uber_status: z.enum(["Active", "Applying", "Not Yet Registered"]),
  experience: z.string().trim().min(1, "Experience is required"),
  intended_start_date: dateOnlySchema(
    "Start date is required",
    "Start date must be a valid date",
  ).refine(
    (value) => isTodayOrFutureAustraliaDate(value, getTodayInAustralia()),
    "Start date must be today or later",
  ),
  license_photo: applicationFileSchema("Driver licence front photo"),
  license_back_photo: applicationFileSchema("Driver licence back photo"),
  passport_or_uber_profile_screenshot: applicationDocumentFileSchema(
    "Passport or Uber profile screenshot",
  ),
  agreement_accepted: z
    .boolean()
    .refine((value) => value, "You must accept the rental agreement"),
  agreement_signature: z.string().trim().min(2, "Signature is required"),
});

type ApplyValues = z.input<typeof applySchema>;
type ApplySubmissionValues = z.output<typeof applySchema>;

const defaultValues: ApplyValues = {
  name: "",
  phone: "",
  email: "",
  address: "",
  license_number: "",
  license_expiry: "",
  uber_status: "Active",
  experience: "New Driver",
  intended_start_date: "",
  license_photo: null,
  license_back_photo: null,
  passport_or_uber_profile_screenshot: null,
  agreement_accepted: false,
  agreement_signature: "",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-red-300 text-[11px] font-semibold tracking-wide">
      {message}
    </p>
  );
}

function SectionShell({
  eyebrow,
  headingId,
  title,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  headingId: string;
  title: string;
  description: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.12)]"
    >
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">
            {eyebrow}
          </p>
          <h2
            id={headingId}
            tabIndex={-1}
            className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-white"
          >
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm sm:text-[15px] leading-7 text-brand-grey">
            {description}
          </p>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function TrustPill({ text }: { text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-brand-gold/20 bg-brand-gold/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-brand-gold" />
      {text}
    </div>
  );
}

function FormLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[10px] font-bold uppercase tracking-[0.32em] text-brand-grey">
      {children}
    </label>
  );
}

function StepBadge({
  step,
  label,
  active,
}: {
  step: string;
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        className={[
          "flex h-11 w-11 items-center justify-center rounded-full border text-[12px] font-bold transition-colors",
          active
            ? "border-brand-gold bg-brand-gold text-brand-navy"
            : "border-white/10 bg-white/[0.03] text-brand-grey",
        ].join(" ")}
      >
        {step}
      </div>
      <span className="max-w-[90px] text-[10px] font-bold uppercase tracking-[0.28em] text-brand-grey">
        {label}
      </span>
    </div>
  );
}

export default function Apply() {
  const previousStepRef = useRef(1);
  const [step, setStep] = useState(1);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedApplicationId, setSubmittedApplicationId] = useState<
    string | null
  >(null);
  const agreementTemplateQuery = useQuery({
    queryKey: ["application-agreement-template"],
    queryFn: fetchApplicationAgreementTemplate,
  });

  const {
    register,
    handleSubmit,
    setValue,
    trigger,
    watch,
    formState: { errors },
  } = useForm<ApplyValues, unknown, ApplySubmissionValues>({
    resolver: zodResolver(applySchema),
    mode: "onChange",
    defaultValues,
  });

  useEffect(() => {
    register("license_photo");
    register("license_back_photo");
    register("passport_or_uber_profile_screenshot");
    register("agreement_accepted");
    register("agreement_signature");
  }, [register]);

  useEffect(() => {
    if (previousStepRef.current === step) {
      return;
    }

    previousStepRef.current = step;
    window.requestAnimationFrame(() => {
      document.getElementById(`application-step-${step}-title`)?.focus();
    });
  }, [step]);

  const licensePhoto = watch("license_photo");
  const licenseBackPhoto = watch("license_back_photo");
  const passportDocument = watch("passport_or_uber_profile_screenshot");
  const agreementAccepted = watch("agreement_accepted");
  const agreementSignature = watch("agreement_signature");
  const agreementTemplateVersion =
    agreementTemplateQuery.data?.agreementTemplateVersion ?? null;
  const agreementTemplateText = agreementTemplateQuery.data?.agreement?.trim() ?? "";
  const agreementTemplateReady =
    agreementTemplateQuery.isSuccess &&
    agreementTemplateVersion !== null &&
    agreementTemplateText.length > 0;
  const canSubmitApplication =
    agreementTemplateReady &&
    agreementAccepted &&
    agreementSignature.trim().length >= 2 &&
    !isSubmitting;

  const trustSignals = useMemo(
    () => [
      "Fast approval",
      "Approval support",
      "Premium support",
      "Reliable vehicles",
    ],
    [],
  );

  const pageSeo = (
    <Seo
      title="Apply to Drive with Maple Rentals | Sydney Car Rental Applications"
      description="Apply to drive with Maple Rentals for a premium weekly rental and Uber-ready vehicle program in Sydney. Simple onboarding, fast approval, and reliable cars."
      canonicalPath="/apply"
      keywords={[
        "apply to drive maple rentals",
        "uber driver application sydney",
        "weekly rental application",
        "rideshare car rental application",
        "sydney driver onboarding",
      ]}
    />
  );

  const handleFileUpload = (
    event: ChangeEvent<HTMLInputElement>,
    field:
      | "license_photo"
      | "license_back_photo"
      | "passport_or_uber_profile_screenshot",
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      setValue(field, null, { shouldValidate: true });
      return;
    }
    const allowedTypes =
      field === "passport_or_uber_profile_screenshot"
        ? ALLOWED_DOCUMENT_UPLOAD_TYPES
        : ALLOWED_IMAGE_UPLOAD_TYPES;

    if (!allowedTypes.has(file.type)) {
      event.target.value = "";
      setValue(field, null, { shouldValidate: true });
      setPageError(
        field === "passport_or_uber_profile_screenshot"
          ? `Please upload a JPG, PNG, or PDF smaller than ${MAX_UPLOAD_SIZE_MB} MB.`
          : `Please upload a JPG or PNG smaller than ${MAX_UPLOAD_SIZE_MB} MB.`,
      );
      return;
    }
    if (file.size > MAX_APPLICATION_UPLOAD_BYTES) {
      event.target.value = "";
      setValue(field, null, { shouldValidate: true });
      setPageError(
        field === "passport_or_uber_profile_screenshot"
          ? `Please upload a JPG, PNG, or PDF smaller than ${MAX_UPLOAD_SIZE_MB} MB.`
          : `Please upload a JPG or PNG smaller than ${MAX_UPLOAD_SIZE_MB} MB.`,
      );
      return;
    }

    setValue(field, file, { shouldValidate: true });
    setPageError(null);
  };

  const goToNextStep = async () => {
    const fieldsToValidate: FieldPath<ApplyValues>[] =
      step === 1
        ? ["name", "phone", "email", "address", "intended_start_date"]
        : [
            "license_number",
            "license_expiry",
            "uber_status",
            "experience",
            "license_photo",
            "license_back_photo",
            "passport_or_uber_profile_screenshot",
          ];

    const isValid = await trigger(fieldsToValidate, { shouldFocus: true });

    if (isValid) {
      setPageError(null);
      setStep(step === 1 ? 2 : 3);
    } else {
      setPageError("Please correct the highlighted fields before continuing.");
    }
  };

  const onSubmit = async (values: ApplySubmissionValues) => {
    setIsSubmitting(true);
    setPageError(null);

    try {
      if (!agreementTemplateReady) {
        setPageError(
          "The rental agreement is still loading. Please wait a moment and try again.",
        );
        return;
      }

      if (
        !values.license_photo ||
        !values.license_back_photo ||
        !values.passport_or_uber_profile_screenshot
      ) {
        setPageError("Please attach all required documents before submitting.");
        return;
      }

      const payload = new FormData();
      payload.set("name", values.name);
      payload.set("phone", values.phone);
      payload.set("email", values.email);
      payload.set("address", values.address);
      payload.set("license_number", values.license_number);
      payload.set("license_expiry", values.license_expiry);
      payload.set("uber_status", values.uber_status);
      payload.set("experience", values.experience);
      payload.set("intended_start_date", values.intended_start_date);

      payload.set("license_photo", values.license_photo);
      payload.set("license_back_photo", values.license_back_photo);
      payload.set(
        "passport_or_uber_profile_screenshot",
        values.passport_or_uber_profile_screenshot,
      );
      payload.set(
        "agreement_template_version",
        String(agreementTemplateVersion),
      );
      payload.set("agreement_accepted", "true");
      payload.set("agreement_signature", values.agreement_signature.trim());

      const submission = await submitApplication(payload);
      setSubmittedApplicationId(submission.application_id);
    } catch (error) {
      setPageError(
        getApiErrorMessage(
          error,
          "Failed to save your application. Please check your details and try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step < 3) {
      event.preventDefault();
      void goToNextStep();
      return;
    }

    void handleSubmit(onSubmit)(event);
  };

  if (submittedApplicationId) {
    return (
      <>
        {pageSeo}
        <div className="min-h-screen bg-brand-navy pt-28 pb-20">
          <div className="mx-auto max-w-5xl px-6">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_30px_100px_rgba(0,0,0,0.22)]"
            >
              <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="p-8 sm:p-10 lg:p-14">
                  <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-gold/20 bg-brand-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-gold">
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                    Application received
                  </div>
                  <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                    Review in progress
                  </h1>
                  <p className="mt-5 max-w-2xl text-base sm:text-lg leading-8 text-brand-grey">
                    Your application was saved successfully. We will review your
                    details and contact you with next steps if everything is
                    approved.
                  </p>

                  <div className="mt-10 grid gap-4 sm:grid-cols-3">
                    {[
                      "Fast approval",
                      "Vehicle review",
                      "Secure checkout link if approved",
                    ].map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-white/10 bg-brand-navy/40 px-4 py-4 text-sm text-white"
                      >
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                    <Link
                      to="/pricing"
                      className="inline-flex items-center justify-center gap-3 rounded-full bg-brand-gold px-8 py-4 text-xs font-bold uppercase tracking-[0.22em] text-brand-navy transition-colors hover:bg-brand-gold-light"
                    >
                      View plans
                    </Link>
                    <Link
                      to="/"
                      className="inline-flex items-center justify-center gap-3 rounded-full border border-white/10 px-8 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-white/5"
                    >
                      Return home
                    </Link>
                  </div>
                </div>

                <div className="border-t border-white/10 bg-brand-navy/60 p-8 sm:p-10 lg:border-l lg:border-t-0 lg:p-12">
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">
                    Reference
                  </p>
                  <p className="mt-3 text-lg font-semibold text-white">
                    Application #{submittedApplicationId}
                  </p>
                  <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-grey">
                      Next steps
                    </p>
                    <ul className="mt-5 space-y-4 text-sm leading-7 text-brand-grey">
                      <li>
                        1. A team member reviews your application and documents.
                      </li>
                      <li>
                        2. We confirm vehicle availability and the approved
                        handoff details.
                      </li>
                      <li>
                        3. You receive a secure checkout link if approved.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {pageSeo}
      <div className="min-h-screen bg-brand-navy">
        <section className="relative overflow-hidden border-b border-white/10 pt-24 sm:pt-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(197,160,40,0.18),transparent_32%)]" />
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <div className="relative mx-auto grid max-w-7xl gap-10 px-6 pb-12 pt-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:gap-12 lg:pb-16 lg:pt-14">
            <motion.div
              variants={heroVariants}
              initial="hidden"
              animate="visible"
              className="lg:sticky lg:top-28"
            >
              <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-black/10 p-6 sm:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">
                  Driver onboarding
                </p>
                <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl xl:text-6xl">
                  Apply to Drive with{" "}
                  <span className="font-serif italic text-brand-gold">
                    Maple Rentals
                  </span>
                </h1>
                <p className="mt-6 max-w-xl text-base leading-8 text-brand-grey sm:text-lg">
                  Build your weekly earnings with a premium onboarding program
                  designed for Uber drivers. Quick approval, reliable cars, and
                  direct support keep onboarding simple.
                </p>

                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {[
                    { value: "24-48h", label: "Typical review window" },
                    { value: "Weekly", label: "Rental cadence" },
                    { value: "Uber-ready", label: "Vehicle standard" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
                    >
                      <p className="text-2xl font-bold tracking-tight text-white">
                        {item.value}
                      </p>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-brand-grey">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  {trustSignals.map((signal) => (
                    <TrustPill key={signal} text={signal} />
                  ))}
                </div>

                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      title: "Weekly earning focus",
                      text: "Share your driving goals and weekly budget so we can review the right rental setup privately.",
                    },
                    {
                      title: "Reliable vehicles",
                      text: "Hybrid, Uber-ready cars prepared to keep you on the road longer.",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
                    >
                      <p className="text-sm font-semibold text-white">
                        {item.title}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-brand-grey">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-10 rounded-[1.75rem] border border-brand-gold/20 bg-brand-gold/8 p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-brand-gold" />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Fast, premium onboarding
                      </p>
                      <p className="mt-2 text-sm leading-7 text-brand-grey">
                        Complete the form in a few minutes, upload your licence
                        documents securely, and receive a decision-ready
                        application for review.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-grey">
                      What we look for
                    </p>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-brand-grey">
                      <li>
                        • A valid Australian licence and clean document uploads.
                      </li>
                      <li>
                        • Willingness to drive regularly and keep a professional
                        standard.
                      </li>
                      <li>
                        • Clear onboarding details that help us match the right
                        rental setup.
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-grey">
                      Why drivers choose Maple
                    </p>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-brand-grey">
                      <li>
                        • Vehicle pricing and registration details are confirmed
                        privately after approval.
                      </li>
                      <li>
                        • Premium support through the application and handoff.
                      </li>
                      <li>
                        • Reliable fleet choices designed for ride-share work.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_30px_100px_rgba(0,0,0,0.24)]"
            >
              <div className="border-b border-white/10 px-6 py-5 sm:px-8">
                <div className="flex flex-wrap items-center gap-3">
                  <StepBadge step="1" label="Identity" active={step >= 1} />
                  <div className="hidden h-px flex-1 bg-white/10 sm:block" />
                  <StepBadge step="2" label="Docs" active={step >= 2} />
                  <div className="hidden h-px flex-1 bg-white/10 sm:block" />
                  <StepBadge step="3" label="Agreement" active={step >= 3} />
                </div>
                <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  Step {step} of 3
                </p>
              </div>

              <div className="space-y-6 p-6 sm:p-8">
                {pageError && (
                  <div role="alert" aria-live="assertive" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
                      <p className="text-sm leading-7 text-red-50">
                        {pageError}
                      </p>
                    </div>
                  </div>
                )}

                <motion.form onSubmit={handleFormSubmit} className="space-y-6">
                  {step === 1 && (
                    <SectionShell
                      eyebrow="Step 1"
                      headingId="application-step-1-title"
                      title="Personal Info"
                      description="Tell us who you are and how we can reach you. We keep this fast, clear, and mobile-friendly."
                      icon={User}
                    >
                      <div className="grid gap-5 md:grid-cols-2">
                        <div className="space-y-2">
                          <FormLabel htmlFor="application-name">Full name</FormLabel>
                          <input
                            id="application-name"
                            autoComplete="name"
                            aria-describedby={errors.name ? "application-name-error" : undefined}
                            aria-invalid={Boolean(errors.name)}
                            {...register("name")}
                            className="w-full rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors placeholder:text-brand-grey focus:border-brand-gold"
                            placeholder="As shown on your licence"
                          />
                          <FieldError id="application-name-error" message={errors.name?.message} />
                        </div>

                        <div className="space-y-2">
                          <FormLabel htmlFor="application-phone">Mobile number</FormLabel>
                          <input
                            id="application-phone"
                            type="tel"
                            autoComplete="tel"
                            aria-describedby={errors.phone ? "application-phone-error" : undefined}
                            aria-invalid={Boolean(errors.phone)}
                            {...register("phone")}
                            className="w-full rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors placeholder:text-brand-grey focus:border-brand-gold"
                            placeholder="0412 345 678"
                          />
                          <FieldError id="application-phone-error" message={errors.phone?.message} />
                        </div>

                        <div className="space-y-2">
                          <FormLabel htmlFor="application-email">Email address</FormLabel>
                          <input
                            id="application-email"
                            type="email"
                            autoComplete="email"
                            aria-describedby={errors.email ? "application-email-error" : undefined}
                            aria-invalid={Boolean(errors.email)}
                            {...register("email")}
                            className="w-full rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors placeholder:text-brand-grey focus:border-brand-gold"
                            placeholder="driver@example.com"
                          />
                          <FieldError id="application-email-error" message={errors.email?.message} />
                        </div>

                        <div className="space-y-2">
                          <FormLabel htmlFor="application-start-date">Intended start date</FormLabel>
                          <input
                            id="application-start-date"
                            type="date"
                            aria-describedby={errors.intended_start_date ? "application-start-date-error" : undefined}
                            aria-invalid={Boolean(errors.intended_start_date)}
                            {...register("intended_start_date")}
                            className="w-full rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors focus:border-brand-gold"
                          />
                          <FieldError
                            id="application-start-date-error"
                            message={errors.intended_start_date?.message}
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <FormLabel htmlFor="application-address">Residential address</FormLabel>
                          <textarea
                            id="application-address"
                            autoComplete="street-address"
                            aria-describedby={errors.address ? "application-address-error" : undefined}
                            aria-invalid={Boolean(errors.address)}
                            {...register("address")}
                            rows={3}
                            className="w-full resize-none rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors placeholder:text-brand-grey focus:border-brand-gold"
                            placeholder="Street, suburb, state, postcode"
                          />
                          <FieldError id="application-address-error" message={errors.address?.message} />
                        </div>
                      </div>
                    </SectionShell>
                  )}

                  {step === 2 && (
                    <SectionShell
                      eyebrow="Step 2"
                      headingId="application-step-2-title"
                      title="Licence Details"
                      description="Upload your documents and share the driving information we need for review."
                      icon={ShieldCheck}
                    >
                      <div className="grid gap-5 lg:grid-cols-3">
                        <div className="space-y-2">
                          <FormLabel htmlFor="application-licence-number">Licence number</FormLabel>
                          <input
                            id="application-licence-number"
                            aria-describedby={errors.license_number ? "application-licence-number-error" : undefined}
                            aria-invalid={Boolean(errors.license_number)}
                            {...register("license_number")}
                            className="w-full rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors placeholder:text-brand-grey focus:border-brand-gold"
                            placeholder="NSW licence number"
                          />
                          <FieldError
                            id="application-licence-number-error"
                            message={errors.license_number?.message}
                          />
                        </div>

                        <div className="space-y-2">
                          <FormLabel htmlFor="application-licence-expiry">Licence expiry</FormLabel>
                          <input
                            id="application-licence-expiry"
                            type="date"
                            aria-describedby={errors.license_expiry ? "application-licence-expiry-error" : undefined}
                            aria-invalid={Boolean(errors.license_expiry)}
                            {...register("license_expiry")}
                            className="w-full rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors focus:border-brand-gold"
                          />
                          <FieldError
                            id="application-licence-expiry-error"
                            message={errors.license_expiry?.message}
                          />
                        </div>

                        <div className="space-y-2">
                          <FormLabel htmlFor="application-passport-document">Passport or Uber profile screenshot</FormLabel>
                          <input
                            id="application-passport-document"
                            type="file"
                            aria-describedby={errors.passport_or_uber_profile_screenshot ? "application-passport-document-error" : undefined}
                            aria-invalid={Boolean(errors.passport_or_uber_profile_screenshot)}
                            accept={APPLICATION_DOCUMENT_CONTENT_TYPES.join(",")}
                            onChange={(event) =>
                              handleFileUpload(
                                event,
                                "passport_or_uber_profile_screenshot",
                              )
                            }
                            className="w-full rounded-2xl border border-dashed border-white/40 bg-white/[0.03] px-5 py-4 text-xs text-brand-grey file:mr-4 file:rounded-full file:border-0 file:bg-brand-gold file:px-4 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.24em] file:text-brand-navy hover:border-brand-gold/40"
                          />
                          <p className="text-[11px] leading-6 text-brand-grey">
                            JPG, PNG, or PDF. Maximum file size is{" "}
                            {MAX_UPLOAD_SIZE_MB} MB.
                          </p>
                          <FieldError
                            id="application-passport-document-error"
                            message={
                              errors.passport_or_uber_profile_screenshot?.message
                            }
                          />
                          {passportDocument && (
                            <p className="text-[10px] uppercase tracking-[0.28em] text-brand-gold">
                              {passportDocument.name}
                            </p>
                          )}
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-grey">
                            Front photo
                          </p>
                          <p className="mt-2 text-sm leading-7 text-brand-grey">
                            Upload a clear JPG or PNG. Maximum file size is{" "}
                            {MAX_UPLOAD_SIZE_MB} MB.
                          </p>
                          <label className="mt-5 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-white/40 bg-white/[0.03] px-5 py-8 text-center transition-colors hover:border-brand-gold/40 focus-within:border-brand-gold focus-within:ring-2 focus-within:ring-brand-gold focus-within:ring-offset-2 focus-within:ring-offset-brand-navy">
                            <Upload aria-hidden="true" className="h-5 w-5 text-brand-gold" />
                            <span className="text-xs font-bold uppercase tracking-[0.28em] text-white">
                              Upload front photo
                            </span>
                            <span className="text-xs text-brand-grey">
                              {licensePhoto
                                ? licensePhoto.name
                                : "Choose an image file"}
                            </span>
                            <input
                              id="application-licence-front"
                              type="file"
                              aria-label="Driver licence front photo"
                              aria-describedby={errors.license_photo ? "application-licence-front-error" : undefined}
                              aria-invalid={Boolean(errors.license_photo)}
                              accept={APPLICATION_IMAGE_CONTENT_TYPES.join(",")}
                              className="sr-only"
                              onChange={(event) =>
                                handleFileUpload(event, "license_photo")
                              }
                            />
                          </label>
                          <div className="mt-4">
                            <FieldError
                              id="application-licence-front-error"
                              message={errors.license_photo?.message}
                            />
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-grey">
                            Back photo
                          </p>
                          <p className="mt-2 text-sm leading-7 text-brand-grey">
                            Upload the back of your licence as a clear JPG or
                            PNG.
                          </p>
                          <label className="mt-5 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-white/40 bg-white/[0.03] px-5 py-8 text-center transition-colors hover:border-brand-gold/40 focus-within:border-brand-gold focus-within:ring-2 focus-within:ring-brand-gold focus-within:ring-offset-2 focus-within:ring-offset-brand-navy">
                            <Upload aria-hidden="true" className="h-5 w-5 text-brand-gold" />
                            <span className="text-xs font-bold uppercase tracking-[0.28em] text-white">
                              Upload back photo
                            </span>
                            <span className="text-xs text-brand-grey">
                              {licenseBackPhoto
                                ? licenseBackPhoto.name
                                : "Choose an image file"}
                            </span>
                            <input
                              id="application-licence-back"
                              type="file"
                              aria-label="Driver licence back photo"
                              aria-describedby={errors.license_back_photo ? "application-licence-back-error" : undefined}
                              aria-invalid={Boolean(errors.license_back_photo)}
                              accept={APPLICATION_IMAGE_CONTENT_TYPES.join(",")}
                              className="sr-only"
                              onChange={(event) =>
                                handleFileUpload(event, "license_back_photo")
                              }
                            />
                          </label>
                          <div className="mt-4">
                            <FieldError
                              id="application-licence-back-error"
                              message={errors.license_back_photo?.message}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-5 md:grid-cols-2">
                        <div className="space-y-2">
                          <FormLabel htmlFor="application-uber-status">Uber status</FormLabel>
                          <select
                            id="application-uber-status"
                            aria-describedby={errors.uber_status ? "application-uber-status-error" : undefined}
                            aria-invalid={Boolean(errors.uber_status)}
                            {...register("uber_status")}
                            className="w-full appearance-none rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors focus:border-brand-gold"
                          >
                            <option value="Active">Active Driver</option>
                            <option value="Applying">Applying</option>
                            <option value="Not Yet Registered">
                              Not Yet Registered
                            </option>
                          </select>
                          <FieldError id="application-uber-status-error" message={errors.uber_status?.message} />
                        </div>

                        <div className="space-y-2">
                          <FormLabel htmlFor="application-experience">Rideshare experience</FormLabel>
                          <select
                            id="application-experience"
                            aria-describedby={errors.experience ? "application-experience-error" : undefined}
                            aria-invalid={Boolean(errors.experience)}
                            {...register("experience")}
                            className="w-full appearance-none rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors focus:border-brand-gold"
                          >
                            <option value="New Driver">New Driver</option>
                            <option value="Less than 1 year">
                              Less than 1 year
                            </option>
                            <option value="1-3 years">1-3 years</option>
                            <option value="3+ years">3+ years</option>
                          </select>
                          <FieldError id="application-experience-error" message={errors.experience?.message} />
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-brand-gold/15 bg-brand-gold/8 px-5 py-4 text-sm leading-7 text-brand-grey">
                        Complete uploads help us move faster and reduce
                        back-and-forth after submission.
                      </div>
                    </SectionShell>
                  )}

                  {step === 3 && (
                    <SectionShell
                      eyebrow="Step 3"
                      headingId="application-step-3-title"
                      title="Agreement Review"
                      description="Review Maple Rentals' final legal rental agreement from the shared template, confirm you accept it, and sign with your full name before submitting."
                      icon={Loader2}
                    >
                      <div className="space-y-5">
                        <div className="rounded-3xl border border-white/10 bg-brand-navy/60 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p
                                id="application-agreement-label"
                                className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold"
                              >
                                Final legal rental agreement
                              </p>
                              <p className="mt-2 text-[10px] uppercase tracking-[0.28em] text-brand-grey">
                                Template version {agreementTemplateVersion ?? "loading..."}
                              </p>
                            </div>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-brand-grey">
                              Shared source of truth
                            </p>
                          </div>
                          <div
                            role="region"
                            tabIndex={0}
                            aria-labelledby="application-agreement-label"
                            className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-white/40 bg-white/[0.02] p-5 text-sm leading-7 text-brand-grey"
                          >
                            {agreementTemplateQuery.isLoading ? (
                              <div role="status" aria-live="polite" className="flex items-center gap-3 text-brand-grey">
                                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-brand-gold" />
                                Loading agreement text...
                              </div>
                            ) : agreementTemplateQuery.isError ? (
                              <p role="alert" className="text-red-300">
                                We could not load the legal agreement text. Please refresh the page and try again.
                              </p>
                            ) : (
                              <div className="whitespace-pre-wrap text-brand-grey">
                                {agreementTemplateText}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                          <label className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                            <input
                              id="application-agreement-accepted"
                              type="checkbox"
                              aria-describedby={errors.agreement_accepted ? "application-agreement-accepted-error" : undefined}
                              aria-invalid={Boolean(errors.agreement_accepted)}
                              {...register("agreement_accepted")}
                              className="mt-1 h-5 w-5 rounded border-white/20 bg-brand-navy text-brand-gold focus:ring-brand-gold"
                            />
                            <span className="text-sm leading-7 text-white">
                              I have read and agree to the rental agreement
                            </span>
                          </label>

                          <div className="space-y-2">
                            <FormLabel htmlFor="application-signature">Typed signature</FormLabel>
                            <input
                              id="application-signature"
                              autoComplete="name"
                              aria-describedby={errors.agreement_signature ? "application-signature-error" : undefined}
                              aria-invalid={Boolean(errors.agreement_signature)}
                              {...register("agreement_signature")}
                              className="w-full rounded-2xl border border-white/40 bg-brand-navy px-5 py-4 text-white outline-none transition-colors placeholder:text-brand-grey focus:border-brand-gold"
                              placeholder="Type your full legal name"
                            />
                            <FieldError
                              id="application-signature-error"
                              message={errors.agreement_signature?.message}
                            />
                          </div>
                        </div>
                        <FieldError
                          id="application-agreement-accepted-error"
                          message={errors.agreement_accepted?.message}
                        />

                        <div className="rounded-2xl border border-brand-gold/15 bg-brand-gold/8 px-5 py-4 text-sm leading-7 text-brand-grey">
                          Your signature will be saved with the application.
                          You cannot submit until the agreement is accepted and
                          signed.
                        </div>
                      </div>
                    </SectionShell>
                  )}

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {step > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setStep(step - 1);
                          setPageError(null);
                        }}
                        className="inline-flex items-center justify-center gap-3 rounded-full border border-white/10 px-7 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-white/5"
                      >
                        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                        Back
                      </button>
                    ) : (
                      <span className="hidden sm:block" />
                    )}

                    <button
                      type="submit"
                      disabled={step === 3 ? !canSubmitApplication : isSubmitting}
                      className="inline-flex items-center justify-center gap-3 rounded-full bg-brand-gold px-8 py-4 text-xs font-bold uppercase tracking-[0.24em] text-brand-navy transition-colors hover:bg-brand-gold-light disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {step < 3 ? (
                        <>
                          Continue
                          <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </>
                      ) : isSubmitting ? (
                        <>
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                          Submitting
                        </>
                      ) : (
                        <>
                          Submit application
                          <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </motion.form>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </>
  );
}
