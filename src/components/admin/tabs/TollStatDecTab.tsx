import React, { ChangeEvent, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Search,
  Send,
  UserRound,
} from 'lucide-react';
import * as api from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errorHandling';

type ResponsibleType = 'responsible' | 'new-owner' | 'previous-owner';

interface TollTransferForm extends api.TollTransferNoticePayload {
  car_name: string;
}

interface TollStatDecTabProps {
  initialSearch?: string;
}

const COMPANY_DETAILS = {
  address: '13/27-33 Addlestone Rd, Merrylands NSW 2160',
  name: 'MAPLE PAINTING PTY LTD',
  phone: '0420 550 556',
};

const TOLL_NOTICE_TEMPLATE_URL = '/forms/tolling-notice-statutory-declaration-companies.pdf';

const createEmptyForm = (): TollTransferForm => ({
  application_id: null,
  authorised_officer_name: '',
  car_name: '',
  customer_id: null,
  declaration_date: null,
  declaration_place: 'Merrylands NSW',
  nominee_address: '',
  nominee_country: 'AUSTRALIA',
  nominee_dob: null,
  nominee_full_name: '',
  nominee_phone: '',
  nominee_postcode: '',
  nominee_state: 'NSW',
  nominee_suburb: '',
  rental_id: null,
  responsible_type: 'responsible',
  toll_notice_number: '',
  toll_trip_date: null,
  vehicle_registration: '',
  witness_jp_number: '',
  witness_name: '',
  witness_qualification: 'Justice of the Peace',
});

const requiredFields: Array<keyof TollTransferForm> = [
  'vehicle_registration',
  'nominee_full_name',
  'nominee_address',
  'nominee_suburb',
  'nominee_state',
  'nominee_postcode',
  'nominee_phone',
  'declaration_place',
  'authorised_officer_name',
];

const labels: Partial<Record<keyof TollTransferForm, string>> = {
  authorised_officer_name: 'Authorised officer name',
  declaration_date: 'Declaration date',
  declaration_place: 'Declaration place',
  nominee_address: 'Mailing address',
  nominee_dob: 'Date of birth',
  nominee_full_name: 'Customer full name',
  nominee_phone: 'Phone',
  nominee_postcode: 'Postcode',
  nominee_state: 'State',
  nominee_suburb: 'Suburb',
  toll_trip_date: 'Toll trip date',
  toll_notice_number: 'Toll notice number',
  vehicle_registration: 'Vehicle registration',
};

const display = (value: unknown) => String(value ?? '').trim() || '-';
const manualDateFields = new Set<keyof TollTransferForm>([
  'nominee_dob',
]);

const parseManualDateInput = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = raw.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})$/);
  const match = iso || local;
  if (!match) return null;

  const year = Number(iso ? match[1] : match[3].length === 2 ? `20${match[3]}` : match[3]);
  const month = Number(iso ? match[2] : match[2]);
  const day = Number(iso ? match[3] : match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const formatIsoDateForManualInput = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : raw;
};

const normalizeOptionalDateForPayload = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim();
  return trimmed ? parseManualDateInput(trimmed) || trimmed : null;
};

type FieldProps = {
  error?: string;
  field: keyof TollTransferForm;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  label: string;
  maxLength?: number;
  onChange: (field: keyof TollTransferForm) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  placeholder?: string;
  required: boolean;
  type?: string;
  value: string;
};

const baseInputClass = (hasError?: boolean) =>
  `w-full rounded-lg border bg-brand-navy px-4 py-3 text-sm text-white outline-none transition-all focus:border-brand-gold ${
    hasError ? 'border-red-400/70' : 'border-white/10'
  }`;

const Field = memo(
  ({
    error,
    field,
    inputMode,
    label,
    maxLength,
    onChange,
    placeholder,
    required,
    type = 'text',
    value,
  }: FieldProps) => (
    <label className="space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
        {label}
        {required && <span className="text-brand-gold"> *</span>}
      </span>
      <input
        className={baseInputClass(Boolean(error))}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={onChange(field)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
    </label>
  )
);

Field.displayName = 'Field';

const TextArea = memo(
  ({
    error,
    field,
    label,
    onChange,
    required,
    value,
  }: Omit<FieldProps, 'inputMode' | 'maxLength' | 'type'>) => (
    <label className="space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
        {label}
        {required && <span className="text-brand-gold"> *</span>}
      </span>
      <textarea
        className={`${baseInputClass(Boolean(error))} min-h-24 resize-y`}
        onChange={onChange(field)}
        value={value}
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
    </label>
  )
);

TextArea.displayName = 'TextArea';

type OriginalNoticePreviewProps = {
  fileName?: string;
  fileUrl: string;
  mimeType?: string;
};

const getOriginalNoticeType = (mimeType: string, fileName: string, fileUrl: string) => {
  const normalizedMime = mimeType.toLowerCase();
  const source = `${fileName} ${fileUrl}`.toLowerCase().split(/[?#]/)[0];

  if (normalizedMime.includes('application/pdf') || source.endsWith('.pdf')) {
    return 'pdf';
  }

  if (normalizedMime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(source)) {
    return 'image';
  }

  return 'unsupported';
};

const OriginalNoticePreview = memo(
  ({ fileName = 'Original toll notice', fileUrl, mimeType = '' }: OriginalNoticePreviewProps) => {
    const [preview, setPreview] = useState<{
      error: boolean;
      objectUrl: string | null;
      status: 'idle' | 'loading' | 'ready';
      type: 'image' | 'pdf' | 'unsupported';
    }>({
      error: false,
      objectUrl: null,
      status: 'idle',
      type: getOriginalNoticeType(mimeType, fileName, fileUrl),
    });

    useEffect(() => {
      const controller = new AbortController();
      let objectUrl: string | null = null;

      setPreview({
        error: false,
        objectUrl: null,
        status: 'loading',
        type: getOriginalNoticeType(mimeType, fileName, fileUrl),
      });

      const loadPreview = async () => {
        try {
          const response = await fetch(fileUrl, {
            credentials: 'include',
            signal: controller.signal,
          });

          if (!response.ok) {
            console.error('Original notice preview failed to load', {
              status: response.status,
              url: fileUrl,
            });
            setPreview((current) => ({ ...current, error: true, status: 'ready' }));
            return;
          }

          const responseMimeType = response.headers.get('Content-Type') || mimeType;
          const type = getOriginalNoticeType(responseMimeType, fileName, fileUrl);
          if (type === 'unsupported') {
            setPreview({ error: false, objectUrl: null, status: 'ready', type });
            return;
          }

          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          setPreview({ error: false, objectUrl, status: 'ready', type });
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error('Original notice preview failed to load', error);
            setPreview((current) => ({ ...current, error: true, status: 'ready' }));
          }
        }
      };

      void loadPreview();

      return () => {
        controller.abort();
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }, [fileName, fileUrl, mimeType]);

    if (preview.status === 'loading') {
      return (
        <div className="flex h-full w-full items-center justify-center bg-white text-sm text-brand-navy">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading original notice...
        </div>
      );
    }

    if (preview.error) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-white p-6 text-center text-sm font-semibold text-brand-navy">
          Original notice could not be loaded
        </div>
      );
    }

    if (preview.type === 'unsupported' || !preview.objectUrl) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-white p-6 text-center text-sm font-semibold text-brand-navy">
          Original notice file type is not supported for preview
        </div>
      );
    }

    if (preview.type === 'image') {
      return (
        <img
          alt={fileName}
          className="h-full w-full object-contain"
          src={preview.objectUrl}
        />
      );
    }

    return (
      <iframe
        className="h-full w-full border-0"
        src={`${preview.objectUrl}#toolbar=0&navpanes=0&view=FitH`}
        title={fileName}
      />
    );
  }
);

OriginalNoticePreview.displayName = 'OriginalNoticePreview';

export default function TollStatDecTab({ initialSearch = '' }: TollStatDecTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [form, setForm] = useState<TollTransferForm>(createEmptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof TollTransferForm, string>>>({});
  const [lastGeneratedId, setLastGeneratedId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');

  useEffect(() => {
    setSearch(initialSearch);
    setDebouncedSearch(initialSearch.trim());
  }, [initialSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [search]);

  const rentalOptionsQuery = useQuery({
    queryKey: ['toll-notice-rental-options', debouncedSearch],
    queryFn: () => api.fetchTollNoticeRentalOptions(debouncedSearch),
    staleTime: 30_000,
  });

  const historyQuery = useQuery({
    queryKey: ['toll-transfer-notices'],
    queryFn: api.fetchTollTransferNotices,
  });

  const createMutation = useMutation({
    mutationFn: api.createTollTransferNotice,
    onSuccess: async (notice) => {
      setLastGeneratedId(notice.id);
      setMessage({ type: 'success', text: 'Toll transfer notice generated and saved.' });
      await queryClient.invalidateQueries({ queryKey: ['toll-transfer-notices'] });
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: getApiErrorMessage(error, 'Failed to generate toll transfer notice.'),
      });
    },
  });

  const markSentMutation = useMutation({
    mutationFn: api.markTollTransferNoticeSent,
    onSuccess: async () => {
      setMessage({ type: 'success', text: 'Toll transfer notice marked as sent.' });
      await queryClient.invalidateQueries({ queryKey: ['toll-transfer-notices'] });
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: getApiErrorMessage(error, 'Failed to mark toll transfer notice as sent.'),
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, recipient_email }: { id: number; recipient_email: string }) =>
      api.sendTollTransferNotice(id, {
        recipient_email,
        recipient_name: 'Toll compliance team',
      }),
    onSuccess: async (notice) => {
      setMessage({
        type: 'success',
        text: `Toll transfer notice sent to ${notice.sent_to}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['toll-transfer-notices'] });
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: getApiErrorMessage(error, 'Failed to email toll transfer notice.'),
      });
    },
  });

  const effectiveRequiredFields = useMemo(() => requiredFields, []);
  const missingRequiredFields = useMemo(
    () => effectiveRequiredFields.filter((field) => !String(form[field] ?? '').trim()),
    [effectiveRequiredFields, form]
  );
  const selectedRentalSummary = useMemo(() => {
    if (!form.rental_id && !form.application_id && !form.car_name) {
      return null;
    }

    return {
      application: form.application_id || '-',
      car: form.car_name || '-',
      rental: form.rental_id ? String(form.rental_id) : '-',
    };
  }, [form.application_id, form.car_name, form.rental_id]);

  const updateField = useCallback(<K extends keyof TollTransferForm>(
    field: K,
    value: TollTransferForm[K]
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }, []);

  const handleTextChange = useCallback(
    (field: keyof TollTransferForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const rawValue = event.target.value;
      const value = (
        field === 'vehicle_registration' ||
        field === 'toll_notice_number' ||
        field === 'nominee_state' ||
        field === 'nominee_country'
          ? rawValue.toUpperCase()
          : rawValue
      ) as never;

      updateField(field, value);
    },
    [updateField]
  );

  const applyRentalOption = (option: api.TollNoticeRentalOption) => {
    setForm((current) => ({
      ...current,
      application_id: option.application_id || null,
      car_name: option.car_name,
      customer_id: option.customer_id,
      nominee_address: option.nominee_address,
      nominee_country: option.nominee_country || 'AUSTRALIA',
      nominee_dob: formatIsoDateForManualInput(option.nominee_dob),
      nominee_full_name: option.nominee_full_name,
      nominee_phone: option.nominee_phone,
      nominee_postcode: option.nominee_postcode,
      nominee_state: option.nominee_state || 'NSW',
      nominee_suburb: option.nominee_suburb,
      rental_id: option.rental_id,
      vehicle_registration: option.vehicle_registration,
    }));
    setSearch(option.nominee_full_name || option.application_id);
    setErrors({});
    setLastGeneratedId(null);
  };

  const validate = () => {
    const nextErrors: Partial<Record<keyof TollTransferForm, string>> = {};
    for (const field of effectiveRequiredFields) {
      if (!String(form[field] ?? '').trim()) {
        nextErrors[field] = `${labels[field] || field} is required`;
      }
    }
    for (const field of manualDateFields) {
      const rawValue = String(form[field] ?? '').trim();
      if (rawValue && !parseManualDateInput(rawValue)) {
        nextErrors[field] = `${labels[field] || field} must be DD/MM/YYYY or YYYY-MM-DD`;
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = (): api.TollTransferNoticePayload => ({
    application_id: form.application_id || null,
    authorised_officer_name: form.authorised_officer_name.trim(),
    customer_id: form.customer_id || null,
    declaration_date: null,
    declaration_place: form.declaration_place.trim(),
    nominee_address: form.nominee_address.trim(),
    nominee_country: form.nominee_country.trim() || 'AUSTRALIA',
    nominee_dob: normalizeOptionalDateForPayload(form.nominee_dob),
    nominee_full_name: form.nominee_full_name.trim(),
    nominee_phone: form.nominee_phone.trim(),
    nominee_postcode: form.nominee_postcode.trim(),
    nominee_state: form.nominee_state.trim(),
    nominee_suburb: form.nominee_suburb.trim(),
    rental_id: form.rental_id || null,
    responsible_type: form.responsible_type,
    toll_notice_number: String(form.toll_notice_number || '').trim() || null,
    toll_trip_date: null,
    vehicle_registration: form.vehicle_registration.trim().toUpperCase(),
    witness_jp_number: form.witness_jp_number?.trim() || null,
    witness_name: form.witness_name?.trim() || null,
    witness_qualification: form.witness_qualification?.trim() || null,
  });

  const handleGenerate = () => {
    setMessage(null);
    if (!validate()) {
      setMessage({ type: 'error', text: 'Complete the required fields before generating.' });
      return;
    }
    createMutation.mutate(buildPayload());
  };

  const handleDownload = async (id: number) => {
    try {
      const blob = await api.fetchTollTransferNoticePdf(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `toll-transfer-notice-${id}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMessage({
        type: 'error',
        text: getApiErrorMessage(error, 'Failed to download toll transfer notice PDF.'),
      });
    }
  };

  const handleSendNotice = (id: number) => {
    const trimmedRecipientEmail = recipientEmail.trim();
    if (!trimmedRecipientEmail) {
      setMessage({ type: 'error', text: 'Enter a recipient email before sending.' });
      return;
    }

    setMessage(null);
    sendMutation.mutate({ id, recipient_email: trimmedRecipientEmail });
  };

  const inputClass = (field: keyof TollTransferForm) =>
    baseInputClass(Boolean(errors[field]));

  const fieldProps = (field: keyof TollTransferForm) => ({
    error: errors[field],
    field,
    onChange: handleTextChange,
    required: effectiveRequiredFields.includes(field),
    value: String(form[field] ?? ''),
  });

  return (
    <motion.div
      key="toll-notices"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold uppercase tracking-tighter text-white sm:text-4xl">
            Toll <span className="text-brand-gold italic">Transfer Notices</span>
          </h2>
          <p className="max-w-3xl text-sm font-light text-brand-grey">
            Generate NSW Tolling Notice Statutory Declaration – Companies forms from active rentals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(createEmptyForm());
            setErrors({});
            setLastGeneratedId(null);
            setMessage(null);
          }}
          className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10 md:w-auto"
        >
          <FileText className="h-4 w-4 text-brand-gold" />
          New Notice
        </button>
      </div>

      <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <p className="font-bold">Original toll notice or copy must be enclosed.</p>
            {!form.nominee_dob && (
              <p className="mt-1 text-xs text-amber-100/80">
                Date of birth is missing. Continue only if it is not available in records.
              </p>
            )}
            {missingRequiredFields.length > 0 && (
              <p className="mt-1 text-xs text-amber-100/80">
                Missing required fields: {missingRequiredFields.map((field) => labels[field]).join(', ')}.
              </p>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${
            message.type === 'success'
              ? 'border-green-400/30 bg-green-400/10 text-green-100'
              : 'border-red-400/30 bg-red-400/10 text-red-100'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-green-300" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-300" />
          )}
          {message.text}
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(320px,0.85fr)_minmax(620px,1.15fr)]">
        <div className="space-y-6">
          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
              <Search className="h-4 w-4 text-brand-gold" />
              Select Rental
            </h3>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey" />
              <input
                className="w-full rounded-lg border border-white/10 bg-brand-navy py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-brand-gold"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, phone, rego, application ID..."
                value={search}
              />
            </div>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {rentalOptionsQuery.isLoading && (
                <p className="text-xs text-brand-grey">Loading active rentals...</p>
              )}
              {rentalOptionsQuery.data?.map((option) => (
                <button
                  key={`${option.rental_id}-${option.application_id}`}
                  type="button"
                  onClick={() => applyRentalOption(option)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-brand-gold/50 hover:bg-white/10"
                >
                  <p className="text-sm font-bold text-white">{display(option.nominee_full_name)}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-brand-grey">
                    {display(option.car_name)} | Rego {display(option.vehicle_registration)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-brand-grey">
                    App {option.application_id} | Rental {option.rental_id}
                  </p>
                </button>
              ))}
              {!rentalOptionsQuery.isLoading && rentalOptionsQuery.data?.length === 0 && (
                <p className="text-xs text-brand-grey">No active rentals matched.</p>
              )}
            </div>
            {selectedRentalSummary && (
              <div className="mt-4 rounded-lg border border-brand-gold/30 bg-brand-gold/10 p-4 text-xs text-white">
                <p className="mb-2 font-bold uppercase tracking-widest text-brand-gold">
                  Selected rental
                </p>
                <div className="grid gap-2">
                  <p>
                    <span className="text-brand-grey">Vehicle:</span> {selectedRentalSummary.car}
                  </p>
                  <p>
                    <span className="text-brand-grey">Rental:</span> {selectedRentalSummary.rental}
                    {' | '}
                    <span className="text-brand-grey">Application:</span>{' '}
                    {selectedRentalSummary.application}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
              <BadgeCheck className="h-4 w-4 text-brand-gold" />
              Company Details
            </h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-brand-grey">Company</dt>
                <dd className="font-bold text-white">{COMPANY_DETAILS.name}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-brand-grey">Address</dt>
                <dd className="text-white">{COMPANY_DETAILS.address}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-brand-grey">Phone</dt>
                <dd className="text-white">{COMPANY_DETAILS.phone}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
              <ClipboardList className="h-4 w-4 text-brand-gold" />
              Notice Details
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field {...fieldProps('toll_notice_number')} label="Toll notice number" maxLength={20} />
              <Field {...fieldProps('vehicle_registration')} label="Vehicle registration" maxLength={8} />
              <label className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
                  Responsible type
                </span>
                <select
                  className={inputClass('responsible_type')}
                  onChange={(event) =>
                    updateField('responsible_type', event.target.value as ResponsibleType)
                  }
                  value={form.responsible_type}
                >
                  <option value="responsible">Was responsible for toll</option>
                  <option value="new-owner">Was the new owner</option>
                  <option value="previous-owner">Was the previous owner</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
              <UserRound className="h-4 w-4 text-brand-gold" />
              Customer / Driver
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field {...fieldProps('nominee_full_name')} label="Full name" />
              <Field
                {...fieldProps('nominee_dob')}
                inputMode="numeric"
                label="Date of birth"
                placeholder="DD/MM/YYYY"
              />
              <Field {...fieldProps('nominee_phone')} inputMode="tel" label="Phone" />
              <Field {...fieldProps('nominee_suburb')} label="Suburb" />
              <TextArea {...fieldProps('nominee_address')} label="Mailing address" />
              <div className="grid gap-4">
                <Field {...fieldProps('nominee_state')} label="State" maxLength={3} />
                <Field {...fieldProps('nominee_postcode')} inputMode="numeric" label="Postcode" maxLength={4} />
                <Field {...fieldProps('nominee_country')} label="Country" />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
              <MapPin className="h-4 w-4 text-brand-gold" />
              Declaration & Witness
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field {...fieldProps('declaration_place')} label="Declaration place" />
              <Field {...fieldProps('authorised_officer_name')} label="Authorised officer name" />
              <Field {...fieldProps('witness_name')} label="Witness name" />
              <Field {...fieldProps('witness_qualification')} label="Witness qualification" />
              <Field {...fieldProps('witness_jp_number')} label="JP number if applicable" />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-white/10 bg-brand-navy/60 p-4 text-xs text-brand-grey sm:flex-row sm:items-center sm:justify-between">
              <span>
                {missingRequiredFields.length === 0
                  ? 'Required fields complete'
                  : `${missingRequiredFields.length} required field${missingRequiredFields.length === 1 ? '' : 's'} remaining`}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-white">
                {display(form.vehicle_registration)} | {String(form.toll_notice_number || '').trim()}
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={createMutation.isPending}
                className="inline-flex flex-1 items-center justify-center gap-3 rounded-lg bg-brand-gold px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-brand-navy transition-all hover:bg-brand-gold-light disabled:opacity-50"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Generate PDF
              </button>
              <button
                type="button"
                onClick={() => lastGeneratedId && handleDownload(lastGeneratedId)}
                disabled={!lastGeneratedId}
                className="inline-flex flex-1 items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10 disabled:opacity-40"
              >
                <Download className="h-4 w-4 text-brand-gold" />
                Download PDF
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
                  Recipient email
                </span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-brand-navy px-4 py-3 text-sm text-white outline-none transition-all focus:border-brand-gold"
                  inputMode="email"
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="tolls@example.com"
                  type="email"
                  value={recipientEmail}
                />
              </label>
              <button
                type="button"
                onClick={() => lastGeneratedId && handleSendNotice(lastGeneratedId)}
                disabled={!lastGeneratedId || !recipientEmail.trim() || sendMutation.isPending}
                className="inline-flex items-center justify-center gap-3 self-end rounded-lg border border-white/10 bg-white/5 px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10 disabled:opacity-40"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
                ) : (
                  <Send className="h-4 w-4 text-brand-gold" />
                )}
                Email PDF
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
                <FileText className="h-4 w-4 text-brand-gold" />
                Original Notice
              </h3>
              <a
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10"
                href={TOLL_NOTICE_TEMPLATE_URL}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4 text-brand-gold" />
                Open Original
              </a>
            </div>
            <div className="aspect-[210/297] overflow-hidden rounded-lg bg-white shadow-2xl">
              <OriginalNoticePreview
                fileName="Original tolling notice statutory declaration"
                fileUrl={TOLL_NOTICE_TEMPLATE_URL}
                mimeType="application/pdf"
              />
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-white">
              Notice History
            </h3>
            <div className="space-y-3">
              {historyQuery.data?.map((notice) => (
                <div
                  key={notice.id}
                  className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-white">
                      {String(notice.toll_notice_number || '')} | {notice.vehicle_registration}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-brand-grey">
                      {notice.nominee_full_name} | {notice.status} |{' '}
                      {new Date(notice.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(notice.id)}
                      className="rounded-lg border border-white/10 p-3 text-white hover:bg-white/10"
                      title="Download PDF"
                    >
                      <Download className="h-4 w-4 text-brand-gold" />
                    </button>
                    {notice.status !== 'sent' && (
                      <button
                        type="button"
                        onClick={() =>
                          recipientEmail.trim()
                            ? handleSendNotice(notice.id)
                            : markSentMutation.mutate(notice.id)
                        }
                        disabled={sendMutation.isPending || markSentMutation.isPending}
                        className="rounded-lg border border-white/10 p-3 text-white hover:bg-white/10"
                        title={recipientEmail.trim() ? 'Email PDF' : 'Mark as sent'}
                      >
                        {sendMutation.isPending || markSentMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
                        ) : (
                          <Send className="h-4 w-4 text-brand-gold" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!historyQuery.isLoading && historyQuery.data?.length === 0 && (
                <p className="text-xs text-brand-grey">No toll transfer notices generated yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
