import express from 'express';
import { z } from 'zod';

import { db } from '../db/index.js';
import { escapeHtml, getResend, sanitizeEmailHeaderValue, sendResendEmail } from '../email.js';
import {
  filterRealOperationalCustomers,
  filterRealRentals,
  getImportedApplicationIdSet,
} from '../importedDataFilters.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { buildTollTransferNoticePdf } from '../templates/tollTransferNoticePdf.js';

const router = express.Router();

const COMPANY_DETAILS = {
  organisation_address: '13/27-33 Addlestone Rd, Merrylands NSW 2160',
  organisation_name: 'MAPLE PAINTING PTY LTD',
  organisation_phone: '0420 550 556',
};

const responsibleTypeSchema = z
  .enum(['responsible', 'new-owner', 'previous-owner'])
  .default('responsible');
const statusSchema = z.enum(['draft', 'generated', 'sent']);
const parseManualDateToIso = (value: string | null | undefined) => {
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
const manualDateSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => Boolean(parseManualDateToIso(value)), {
      message: `${label} must be DD/MM/YYYY or YYYY-MM-DD`,
    })
    .transform((value) => parseManualDateToIso(value) as string);
const optionalDateSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    const trimmed = String(value).trim();
    return trimmed || undefined;
  },
  manualDateSchema('Date').optional()
);
const optionalStringSchema = z.preprocess(
  (value) => (value == null ? undefined : String(value).trim()),
  z.string().optional()
);
const tollNoticePayloadBaseSchema = z.object({
  application_id: z.string().trim().uuid().nullable().optional(),
  authorised_officer_name: z.string().trim().min(1, 'Authorised officer name is required'),
  car_id: z.coerce.number().int().positive().nullable().optional(),
  customer_id: z.coerce.number().int().positive().nullable().optional(),
  declaration_date: optionalDateSchema,
  declaration_place: z.string().trim().min(1, 'Declaration place is required'),
  nominee_address: z.string().trim().min(1, 'Address is required'),
  nominee_country: z.string().trim().min(1).default('AUSTRALIA'),
  nominee_dob: optionalDateSchema,
  nominee_full_name: z.string().trim().min(1, 'Customer full name is required'),
  nominee_phone: z.string().trim().min(1, 'Phone is required'),
  nominee_postcode: z.string().trim().min(1, 'Postcode is required'),
  nominee_state: z.string().trim().min(1, 'State is required'),
  nominee_suburb: z.string().trim().min(1, 'Suburb is required'),
  rental_id: z.coerce.number().int().positive().nullable().optional(),
  responsible_type: responsibleTypeSchema,
  toll_notice_number: optionalStringSchema,
  toll_trip_date: optionalDateSchema,
  vehicle_registration: z.string().trim().min(1, 'Vehicle registration is required'),
  witness_jp_number: z.string().trim().nullable().optional(),
  witness_name: z.string().trim().nullable().optional(),
  witness_qualification: z.string().trim().nullable().optional(),
});

const tollNoticePayloadSchema = tollNoticePayloadBaseSchema;

type TollNoticePayload = z.infer<typeof tollNoticePayloadSchema>;

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const markSentSchema = z.object({
  status: z.literal('sent'),
});

const sendNoticeSchema = z.object({
  recipient_email: z.string().trim().email('Recipient email is required'),
  recipient_name: z.string().trim().max(120).optional().nullable(),
});

const normalizeSearch = (value: unknown) => String(value ?? '').trim().toLowerCase();

const splitFullName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { given_names: '', surname: parts[0] || '' };
  }

  return {
    given_names: parts.slice(0, -1).join(' '),
    surname: parts[parts.length - 1],
  };
};

const parseAddressParts = (address: string | null | undefined) => {
  const value = String(address || '').trim();
  const match = value.match(/^(.*?)[,\s]+([A-Za-z ]+)\s+(NSW|ACT|VIC|QLD|SA|WA|TAS|NT)\s+(\d{4})$/i);

  if (!match) {
    return {
      address: value,
      postcode: '',
      state: 'NSW',
      suburb: '',
    };
  }

  return {
    address: match[1]?.replace(/,\s*$/, '').trim() || value,
    postcode: match[4] || '',
    state: (match[3] || 'NSW').toUpperCase(),
    suburb: (match[2] || '').trim().toUpperCase(),
  };
};

const inferVehicleRegistration = (car: Record<string, unknown> | undefined) => {
  const name = String(car?.name || '');
  const bracketMatch = name.match(/\(([A-Z0-9]{2,8})\)\s*$/i);
  if (bracketMatch) {
    return bracketMatch[1].toUpperCase();
  }

  return '';
};

const auditNoticeAction = async ({
  action,
  actor,
  metadata = {},
  noticeId,
}: {
  action: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
  noticeId: number;
}) => {
  const { error } = await db.from('toll_transfer_notice_audit_events').insert([
    {
      action,
      actor: actor || null,
      metadata,
      toll_transfer_notice_id: noticeId,
    },
  ]);

  if (error) {
    console.warn('Failed to record toll transfer notice audit event', {
      action,
      noticeId,
      reason: error.message,
    });
  }
};

const getAdminEmail = (req: express.Request) =>
  typeof req.admin?.email === 'string' ? req.admin.email : null;

const getSafeNoticeValue = (notice: Record<string, unknown>, key: string) =>
  String(notice[key] ?? '').trim();

const fetchNoticeById = async (id: number) => {
  const { data, error } = await db
    .from('toll_transfer_notices')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Record<string, unknown>;
};

const loadRentalPrefillOptions = async (search: string) => {
  const { data: rentals, error: rentalsError } = await db
    .from('rentals')
    .select('*')
    .in('status', ['Active', 'Overdue'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (rentalsError) {
    throw rentalsError;
  }

  const rentalRows = (rentals || []) as Array<Record<string, unknown>>;
  const applicationIds = Array.from(
    new Set(rentalRows.map((rental) => String(rental.application_id || '')).filter(Boolean))
  );
  const carIds = Array.from(
    new Set(
      rentalRows
        .map((rental) => Number(rental.car_id || 0))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  const [applicationsResult, carsResult, customersResult] = await Promise.all([
    applicationIds.length
      ? db
          .from('applications')
          .select('*')
          .in('id', applicationIds)
      : Promise.resolve({ data: [], error: null }),
    carIds.length
      ? db
          .from('cars')
          .select('id, name')
          .in('id', carIds)
      : Promise.resolve({ data: [], error: null }),
    db
      .from('customers')
      .select('id, full_name, phone, email, date_of_birth, street, city, state, postcode')
      .limit(500),
  ]);

  if (applicationsResult.error) throw applicationsResult.error;
  if (carsResult.error) throw carsResult.error;
  if (customersResult.error) throw customersResult.error;

  const importedApplicationIds = getImportedApplicationIdSet(
    (applicationsResult.data || []) as Array<Record<string, unknown>>,
  );
  const realRentalRows = filterRealRentals(rentalRows, importedApplicationIds);
  const applicationsById = new Map<string, Record<string, unknown>>();
  for (const application of applicationsResult.data || []) {
    applicationsById.set(String(application.id), application as Record<string, unknown>);
  }

  const carsById = new Map<number, Record<string, unknown>>();
  for (const car of carsResult.data || []) {
    carsById.set(Number(car.id), car as Record<string, unknown>);
  }

  const customerRows = filterRealOperationalCustomers(
    (customersResult.data || []) as Array<Record<string, unknown>>,
  );
  const customerForApplication = (application: Record<string, unknown> | undefined) => {
    if (!application) {
      return null;
    }

    const email = normalizeSearch(application.email);
    const phone = normalizeSearch(application.phone);
    const name = normalizeSearch(application.name);

    return (
      customerRows.find(
        (customer) =>
          (email && normalizeSearch(customer.email) === email) ||
          (phone && normalizeSearch(customer.phone) === phone) ||
          (name && normalizeSearch(customer.full_name) === name)
      ) || null
    );
  };

  const query = normalizeSearch(search);

  return realRentalRows
    .map((rental) => {
      const application = applicationsById.get(String(rental.application_id || ''));
      const car = carsById.get(Number(rental.car_id || 0));
      const customer = customerForApplication(application);
      const addressParts = parseAddressParts(
        String(customer?.street || '') ||
          String(application?.address || '')
      );
      const fullName = String(customer?.full_name || application?.name || '').trim();
      const { given_names, surname } = splitFullName(fullName);
      const vehicleRegistration = inferVehicleRegistration(car);

      return {
        application_id: String(rental.application_id || ''),
        applicant_name: fullName,
        car_id: Number(rental.car_id || 0) || null,
        car_name: String(car?.name || application?.approved_vehicle || ''),
        customer_id: customer?.id ? Number(customer.id) : null,
        nominee_address: addressParts.address,
        nominee_country: 'AUSTRALIA',
        nominee_dob: customer?.date_of_birth || null,
        nominee_full_name: fullName,
        nominee_given_names: given_names,
        nominee_phone: String(customer?.phone || application?.phone || ''),
        nominee_postcode: customer?.postcode ? String(customer.postcode) : addressParts.postcode,
        nominee_state: customer?.state ? String(customer.state) : addressParts.state,
        nominee_suburb: customer?.city ? String(customer.city) : addressParts.suburb,
        nominee_surname: surname,
        rental_id: Number(rental.id),
        rental_status: String(rental.status || ''),
        vehicle_registration: vehicleRegistration,
      };
    })
    .filter((option) => {
      if (!query) return true;

      return [
        option.nominee_full_name,
        option.nominee_phone,
        option.vehicle_registration,
        option.application_id,
        option.car_name,
      ].some((value) => normalizeSearch(value).includes(query));
    });
};

const toRecordPayload = (payload: TollNoticePayload, req: express.Request) => ({
  ...payload,
  application_id: payload.application_id || null,
  car_id: payload.car_id || null,
  customer_id: payload.customer_id || null,
  declaration_date: payload.declaration_date || null,
  nominee_country: payload.nominee_country.toUpperCase(),
  nominee_dob: payload.nominee_dob || null,
  pdf_url: null,
  rental_id: payload.rental_id || null,
  status: 'generated',
  toll_notice_number: payload.toll_notice_number || null,
  toll_trip_date: payload.toll_trip_date || null,
  created_by: getAdminEmail(req),
});

router.get('/company-defaults', authenticateAdmin, (_req, res) => {
  res.json(COMPANY_DETAILS);
});

router.get('/rental-options', authenticateAdmin, async (req, res) => {
  try {
    const options = await loadRentalPrefillOptions(String(req.query.search || ''));
    res.json({ items: options });
  } catch (error) {
    console.error('Fetch toll notice rental options error:', error);
    res.status(500).json({ error: 'Failed to fetch rental options' });
  }
});

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('toll_transfer_notices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Fetch toll transfer notices error:', error);
    res.status(500).json({ error: 'Failed to fetch toll transfer notices' });
  }
});

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const payload = tollNoticePayloadSchema.parse(req.body);
    const insertPayload = toRecordPayload(payload, req);
    const { data: inserted, error } = await db
      .from('toll_transfer_notices')
      .insert([insertPayload])
      .select('id')
      .single();

    if (error) throw error;

    const id = Number(inserted.id);
    const pdfUrl = `/api/toll-notices/${id}/pdf`;
    const { error: updateError } = await db
      .from('toll_transfer_notices')
      .update({ pdf_url: pdfUrl, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;

    await auditNoticeAction({
      action: 'generate',
      actor: getAdminEmail(req),
      metadata: {
        application_id: payload.application_id || null,
        rental_id: payload.rental_id || null,
        toll_notice_number: payload.toll_notice_number || null,
      },
      noticeId: id,
    });

    res.status(201).json({ id, pdf_url: pdfUrl, status: 'generated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Create toll transfer notice error:', error);
    res.status(500).json({ error: 'Failed to create toll transfer notice' });
  }
});

router.get('/:id/pdf', authenticateAdmin, async (req, res) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const notice = await fetchNoticeById(id);
    if (!notice) {
      return res.status(404).json({ error: 'Toll transfer notice not found' });
    }

    const pdf = await buildTollTransferNoticePdf(notice as any);
    await auditNoticeAction({
      action: 'download',
      actor: getAdminEmail(req),
      metadata: { toll_notice_number: notice.toll_notice_number || null },
      noticeId: id,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="toll-transfer-notice-${id}.pdf"`
    );
    res.send(pdf);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Download toll transfer notice PDF error:', error);
    res.status(500).json({ error: 'Failed to download toll transfer notice PDF' });
  }
});

router.post('/:id/send', authenticateAdmin, async (req, res) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = sendNoticeSchema.parse(req.body ?? {});

    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ error: 'Toll notice email delivery is not configured' });
    }

    const notice = await fetchNoticeById(id);
    if (!notice) {
      return res.status(404).json({ error: 'Toll transfer notice not found' });
    }

    const pdf = await buildTollTransferNoticePdf(notice as any);
    const resend = await getResend();
    const tollNoticeNumber = getSafeNoticeValue(notice, 'toll_notice_number');
    const vehicleRegistration = getSafeNoticeValue(notice, 'vehicle_registration');
    const nomineeName = getSafeNoticeValue(notice, 'nominee_full_name');
    const safeRecipientName = escapeHtml(payload.recipient_name || 'Toll compliance team');
    const safeTollNoticeNumber = escapeHtml(tollNoticeNumber);
    const safeVehicleRegistration = escapeHtml(vehicleRegistration || 'not supplied');
    const safeNomineeName = escapeHtml(nomineeName || 'not supplied');
    const subjectNoticeNumber = sanitizeEmailHeaderValue(tollNoticeNumber || String(id));

    await sendResendEmail(resend, {
      attachments: [
        {
          content: pdf,
          contentType: 'application/pdf',
          filename: `toll-transfer-notice-${id}.pdf`,
        },
      ],
      from: 'Gala Rentals <noreply@galarentals.com.au>',
      html: `
        <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #1a202c;">
          <h2 style="color: #D4AF37;">Toll Transfer Notice</h2>
          <p>Hi ${safeRecipientName},</p>
          <p>Please find the attached toll transfer notice statutory declaration.</p>
          <ul>
            <li><strong>Toll notice number:</strong> ${safeTollNoticeNumber}</li>
            <li><strong>Vehicle registration:</strong> ${safeVehicleRegistration}</li>
            <li><strong>Nominated driver/customer:</strong> ${safeNomineeName}</li>
          </ul>
          <p>Regards,<br /><strong>Gala Rentals</strong></p>
        </div>
      `,
      subject: `Toll Transfer Notice ${subjectNoticeNumber}`,
      to: payload.recipient_email,
    });

    const sentAt = new Date().toISOString();
    const { data, error } = await db
      .from('toll_transfer_notices')
      .update({
        sent_at: sentAt,
        sent_to: payload.recipient_email,
        status: 'sent',
        updated_at: sentAt,
      })
      .eq('id', id)
      .select('id, status, sent_to, sent_at')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Toll transfer notice not found' });
    }

    await auditNoticeAction({
      action: 'send_email',
      actor: getAdminEmail(req),
      metadata: {
        recipient_email: payload.recipient_email,
        toll_notice_number: tollNoticeNumber,
      },
      noticeId: id,
    });

    res.json({
      id: Number(data.id),
      sent_at: data.sent_at,
      sent_to: data.sent_to,
      status: statusSchema.parse(data.status),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Send toll transfer notice email error:', error);
    res.status(502).json({ error: 'Failed to send toll transfer notice email' });
  }
});

router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = markSentSchema.parse(req.body);
    const sentAt = new Date().toISOString();
    const { data, error } = await db
      .from('toll_transfer_notices')
      .update({ sent_at: sentAt, status: payload.status, updated_at: sentAt })
      .eq('id', id)
      .select('id, status, sent_at')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Toll transfer notice not found' });
    }

    await auditNoticeAction({
      action: 'send',
      actor: getAdminEmail(req),
      noticeId: id,
    });

    res.json({ id, sent_at: data.sent_at, status: statusSchema.parse(data.status) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Update toll transfer notice status error:', error);
    res.status(500).json({ error: 'Failed to update toll transfer notice status' });
  }
});

export default router;
