import express from 'express';
import rateLimit from 'express-rate-limit';
import multer, { MulterError } from 'multer';
import type Stripe from 'stripe';

import { updateApplicationPaymentStateIfCurrentVersion } from '../applicationPaymentState.js';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { getStripeClient } from '../stripeClient.js';
import {
  applicationApprovalSchema,
  applicationSchema,
  applicationStatusEnum,
  uuidSchema,
} from '../validation.js';
import { z } from 'zod';
import crypto from 'crypto';
import { createCheckoutToken } from '../checkoutTokens.js';
import {
  getApplicationCreatedAtColumn,
  getApplicationDuplicateCheckColumns,
  getApplicationDocumentColumn,
  getApplicationSelectColumns,
  getCarSelectColumns,
  toApplicationPaymentWritePayload,
  toApplicationWritePayload,
} from '../schemaCompat.js';
import {
  FALLBACK_ADMIN_EMAIL,
  RENTAL_PLAN_SETUP_FEES_AUD,
} from '../constants.js';
import { buildDriverPaymentLink, sendDriverPaymentLinkEmail } from '../paymentLinks.js';
import {
  assertVehicleAllocationAvailable,
  VehicleAllocationConflictError,
} from '../vehicleAllocations.js';
import { handleVehicleCheckoutCompletion } from '../paymentActivation.js';
import {
  ADMIN_PAYMENTS_RESTRICTED_MESSAGE,
  assertTransactionalPaymentProcessing,
} from '../paymentProcessing.js';
import {
  APPLICATION_IMAGE_CONTENT_TYPES,
  normalizeApplicationEmail,
  MAX_APPLICATION_UPLOAD_BYTES,
} from '../../shared/applicationSubmission.js';
import {
  escapeHtml,
  getResend,
  sanitizeEmailHeaderValue,
  sendResendEmail,
} from '../email.js';
import { renderApplicationLeaseAgreement } from '../agreementGeneration.js';
import { normalizeUuid } from '../../shared/uuid.js';

const router = express.Router();
const APPLICATIONS_BUCKET = 'applications';
const DOCUMENT_URL_TTL_SECONDS = 60 * 15;
const APPLICATION_LIST_DOCUMENT_SIGNING_LIMIT = 100;
const ALLOWED_APPLICATION_IMAGE_TYPES = new Set<string>(APPLICATION_IMAGE_CONTENT_TYPES);
const APPLICATION_FILE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};
const getStripe = () => getStripeClient();

type ApplicationUploadField = 'license_photo' | 'license_back_photo';
type UploadedApplicationFiles = Partial<Record<ApplicationUploadField, Express.Multer.File[]>>;

const applicationUpload = multer({
  limits: {
    fileSize: MAX_APPLICATION_UPLOAD_BYTES,
    files: 2,
  },
  storage: multer.memoryStorage(),
});

const applicationSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many applications submitted. Please try again later.' },
  skip: () => process.env.VITEST === 'true',
});

const applicationUploadMiddleware: express.RequestHandler = (req, res, next) => {
  applicationUpload.fields([
    { name: 'license_photo', maxCount: 1 },
    { name: 'license_back_photo', maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Application documents must be smaller than ${Math.floor(
              MAX_APPLICATION_UPLOAD_BYTES / (1024 * 1024)
            )} MB.`
          : 'Invalid multipart upload.';
      res.status(400).json({ error: message });
      return;
    }

    next(error);
  });
};

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);
const SUPABASE_STORAGE_PATH_PREFIXES = [
  `/storage/v1/object/public/${APPLICATIONS_BUCKET}/`,
  `/storage/v1/object/sign/${APPLICATIONS_BUCKET}/`,
  `/object/public/${APPLICATIONS_BUCKET}/`,
  `/object/sign/${APPLICATIONS_BUCKET}/`,
];

const extractStoragePath = (value: string) => {
  if (!isAbsoluteUrl(value)) {
    return value;
  }

  try {
    const { pathname } = new URL(value);
    const prefix = SUPABASE_STORAGE_PATH_PREFIXES.find((candidate) => pathname.includes(candidate));

    if (!prefix) {
      return null;
    }

    return decodeURIComponent(pathname.slice(pathname.indexOf(prefix) + prefix.length));
  } catch {
    return null;
  }
};

const createSignedDocumentUrl = async (path: string | null | undefined) => {
  if (!path) {
    return null;
  }

  const storagePath = extractStoragePath(path);
  if (!storagePath) {
    return path;
  }

  const { data, error } = await db.storage
    .from(APPLICATIONS_BUCKET)
    .createSignedUrl(storagePath, DOCUMENT_URL_TTL_SECONDS);

  if (error) {
    if (
      String((error as { statusCode?: string }).statusCode || '') === '404' ||
      String((error as { status?: number }).status || '') === '404'
    ) {
      console.warn(
        `Application document not found in storage bucket for ${storagePath}; returning null signed URL.`
      );
      return null;
    }

    console.error(`Failed to sign application document ${storagePath}:`, error);
    return null;
  }

  return data.signedUrl;
};

const hasAvailableDocumentSigningCapacity = (index: number) =>
  index < APPLICATION_LIST_DOCUMENT_SIGNING_LIMIT;

type ApplicationPaymentApprovalRecord = {
  approved_bond?: number | null;
  approved_weekly_price?: number | null;
  assigned_car_id?: number | null;
  email: string;
  id: string;
  name: string;
  payment_link_version?: number | null;
  pending_checkout_session_id?: string | null;
  status: string;
};

const isRecoverableVehicleCheckoutSession = (
  session: Stripe.Checkout.Session,
  application: ApplicationPaymentApprovalRecord
) =>
  session.status === 'complete' &&
  session.payment_status === 'paid' &&
  session.metadata?.checkout_kind === 'vehicle' &&
  normalizeUuid(session.metadata?.application_id || '') === normalizeUuid(application.id) &&
  Number(session.metadata?.car_id || 0) === Number(application.assigned_car_id || 0) &&
  Number(session.metadata?.payment_link_version || 0) ===
    Number(application.payment_link_version || 0);

const recoverPaymentReviewSession = async (application: ApplicationPaymentApprovalRecord) => {
  const storedSessionId = application.pending_checkout_session_id;

  if (!storedSessionId) {
    return null;
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(storedSessionId);
    if (isRecoverableVehicleCheckoutSession(session, application)) {
      return session;
    }
  } catch (error) {
    console.warn(`Unable to retrieve stored checkout session ${storedSessionId}:`, error);
  }

  return null;
};

const getApplicationBackPhotoValue = (application: Record<string, any>) =>
  application.license_back_photo ??
  application.uber_screenshot ??
  application.uberScreenshot ??
  null;

const createRequestError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const isVehicleAllocationUniqueConstraintError = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }

  if (String((error as { code?: string }).code || '') !== '23505') {
    return false;
  }

  const message = [
    (error as { message?: string }).message,
    (error as { details?: string }).details,
    (error as { hint?: string }).hint,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  return (
    message.includes('idx_applications_active_vehicle_allocation_unique') ||
    message.includes('assigned_car') ||
    message.includes('assignedcarid')
  );
};

const removeUploadedApplicationDocuments = async (paths: string[]) => {
  if (paths.length === 0) {
    return;
  }

  const { error } = await db.storage.from(APPLICATIONS_BUCKET).remove(paths);

  if (error) {
    console.warn('Failed to clean up uploaded application documents:', error);
  }
};

const fetchCarById = async (carId: number) => {
  const { data: car, error } = await db
    .from('cars')
    .select(await getCarSelectColumns())
    .eq('id', carId)
    .single();

  if (error || !car) {
    return null;
  }

  return car as Record<string, any>;
};

const saveLeaseAgreement = async ({
  applicationId,
  carId,
  content,
}: {
  applicationId: string;
  carId: number;
  content: string;
}) => {
  const { error } = await db.from('lease_agreements').insert([
    {
      application_id: applicationId,
      car_id: carId,
      content,
      status: 'generated',
    },
  ]);

  if (error) {
    throw error;
  }
};

const getUploadedApplicationFile = (
  files: UploadedApplicationFiles,
  field: ApplicationUploadField,
  fieldLabel: string
) => {
  const file = files[field]?.[0];

  if (!file) {
    throw createRequestError(400, `${fieldLabel} is required.`);
  }

  if (!ALLOWED_APPLICATION_IMAGE_TYPES.has(file.mimetype.toLowerCase())) {
    throw createRequestError(400, `${fieldLabel} must be a JPG or PNG image.`);
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw createRequestError(400, `${fieldLabel} could not be read.`);
  }

  if (file.size > MAX_APPLICATION_UPLOAD_BYTES) {
    throw createRequestError(400, `${fieldLabel} must be smaller than 7 MB.`);
  }

  return file;
};

const uploadApplicationFile = async ({
  file,
  filePrefix,
  fieldLabel,
  uploadedPaths,
}: {
  file: Express.Multer.File;
  filePrefix: string;
  fieldLabel: string;
  uploadedPaths: string[];
}) => {
  const normalizedContentType = file.mimetype.toLowerCase();
  const extension =
    APPLICATION_FILE_EXTENSION_BY_CONTENT_TYPE[normalizedContentType] || 'bin';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${filePrefix}.${extension}`;

  const { data: uploadData, error: uploadError } = await db.storage
    .from(APPLICATIONS_BUCKET)
    .upload(filename, file.buffer, {
      contentType: normalizedContentType,
      upsert: false,
    });

  if (uploadError) {
    console.error(`Error uploading ${filePrefix}:`, uploadError);
    throw createRequestError(500, `Failed to upload ${fieldLabel.toLowerCase()}.`);
  }

  const uploadedPath = uploadData.path || filename;
  uploadedPaths.push(uploadedPath);
  return uploadedPath;
};

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    const selectColumns = await getApplicationSelectColumns();
    const orderColumn = await getApplicationCreatedAtColumn();
    const { data, error } = await db
      .from('applications')
      .select(selectColumns)
      .order(orderColumn, { ascending: false });
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch applications' });
    }

    const rows = ((data || []) as Array<Record<string, any>>);
    const applications = await Promise.all(
      rows.map(async (application, index) => {
        const {
          uber_screenshot: _legacyUberScreenshot,
          uberScreenshot: _legacyUberScreenshotCamel,
          ...rest
        } = application;

        if (!hasAvailableDocumentSigningCapacity(index)) {
          return {
            ...rest,
            license_photo: null,
            license_back_photo: null,
          };
        }

        return {
          ...rest,
          license_photo: await createSignedDocumentUrl(application.license_photo),
          license_back_photo: await createSignedDocumentUrl(getApplicationBackPhotoValue(application)),
        };
      })
    );

    res.json(applications);
  } catch (error) {
    console.error('Fetch applications error:', error);
    res.status(500).json({ error: 'Failed to process applications' });
  }
});

router.get('/:id/documents/:document', authenticateAdmin, async (req, res) => {
  try {
    const { id, document } = z.object({
      id: uuidSchema,
      document: z.enum(['license_photo', 'license_back_photo']),
    }).parse(req.params);

    const documentColumn = await getApplicationDocumentColumn(document);
    const selectColumn =
      documentColumn === document ? document : `${document}:${documentColumn}`;

    const { data: application, error } = await db
      .from('applications')
      .select(`id, ${selectColumn}`)
      .eq('id', id)
      .single();

    if (error || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const documentValue =
      application[document] ?? (document === 'license_back_photo' ? getApplicationBackPhotoValue(application) : null);
    const signedUrl = await createSignedDocumentUrl(documentValue);
    if (!signedUrl) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ url: signedUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Application document fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch application document' });
  }
});

router.post(
  '/',
  applicationSubmissionLimiter,
  applicationUploadMiddleware,
  async (req, res) => {
    const uploadedPaths: string[] = [];

    try {
      const data = applicationSchema.parse(req.body);
      const email = data.email;
      const phone = data.phone;

      if (!email) {
        throw createRequestError(400, 'Email is required.');
      }

      if (!phone) {
        throw createRequestError(400, 'Phone is required.');
      }

      const files = (req.files || {}) as UploadedApplicationFiles;
      const licensePhotoFile = getUploadedApplicationFile(
        files,
        'license_photo',
        'Driver licence front photo'
      );
      const licenseBackPhotoFile = getUploadedApplicationFile(
        files,
        'license_back_photo',
        'Driver licence back photo'
      );

      const normalizedApplicationData = {
        ...data,
        email,
        phone,
      };
      let licensePhotoUrl = null;
      let licenseBackPhotoUrl = null;
      const existingApplicationSelectColumns = await getApplicationDuplicateCheckColumns();
      const { data: existingApplications, error: existingApplicationError } = await db
        .from('applications')
        .select(existingApplicationSelectColumns)
        .ilike('email', normalizedApplicationData.email);

      if (existingApplicationError) {
        throw existingApplicationError;
      }

      const matchingApplications = (
        (existingApplications ?? []) as Array<Record<string, any>>
      ).filter(
        (application) =>
          normalizeApplicationEmail(String(application.email ?? '')) ===
          normalizedApplicationData.email
      );

      const existingRow = matchingApplications[0] ?? null;

      if (existingRow) {
        if (
          existingRow.phone !== normalizedApplicationData.phone ||
          existingRow.license_number !== normalizedApplicationData.license_number
        ) {
          return res.status(409).json({
            error: 'An application already exists for this email. Contact support to continue.',
          });
        }

        if (existingRow.status === 'Pending') {
          return res.status(409).json({
            error:
              'This application is already under review. Contact support if you need to update it.',
          });
        }

        if (existingRow.status === 'Rejected') {
          return res.status(409).json({
            error:
              'This application has already been reviewed. Contact support to reopen it securely.',
          });
        }

        if (['Approved', 'Paid', 'Payment Review'].includes(String(existingRow.status))) {
          return res.status(409).json({
            error: 'This application has already been submitted and is being processed.',
          });
        }
      }

      const selectedCarId = Number(normalizedApplicationData.selected_car_id);
      const selectedCar = await fetchCarById(selectedCarId);

      if (!selectedCar) {
        return res.status(404).json({ error: 'Selected vehicle was not found.' });
      }

      if (String(selectedCar.status) !== 'Available') {
        return res.status(409).json({
          error: 'Selected vehicle is no longer available. Please choose another vehicle.',
        });
      }

      licensePhotoUrl = await uploadApplicationFile({
        file: licensePhotoFile,
        filePrefix: 'license-front',
        fieldLabel: 'Driver licence front photo',
        uploadedPaths,
      });
      licenseBackPhotoUrl = await uploadApplicationFile({
        file: licenseBackPhotoFile,
        filePrefix: 'license-back',
        fieldLabel: 'Driver licence back photo',
        uploadedPaths,
      });

      const basePayload = await toApplicationWritePayload({
        ...normalizedApplicationData,
        weekly_budget: normalizedApplicationData.weekly_budget?.trim() || null,
        license_photo: licensePhotoUrl,
        license_back_photo: licenseBackPhotoUrl,
        status: 'Pending',
      });
      const selectionPayload = await toApplicationPaymentWritePayload({
        assigned_car_id: selectedCarId,
      });
      const { data: inserted, error } = await db
        .from('applications')
        .insert([{ ...basePayload, ...selectionPayload }])
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      const applicationId = String(inserted.id);

      if (process.env.RESEND_API_KEY) {
        try {
          const resend = await getResend();
          const adminEmail = process.env.ADMIN_EMAIL || FALLBACK_ADMIN_EMAIL;
          const safeApplicantName = escapeHtml(normalizedApplicationData.name);
          const safeApplicantEmail = escapeHtml(normalizedApplicationData.email);
          const safeApplicantPhone = escapeHtml(normalizedApplicationData.phone);
          const safeApplicantAddress = escapeHtml(normalizedApplicationData.address);
          const safeUberStatus = escapeHtml(normalizedApplicationData.uber_status);
          const safeExperience = escapeHtml(normalizedApplicationData.experience);
          const safeIntendedStart = escapeHtml(normalizedApplicationData.intended_start_date);
          const safeCarName = escapeHtml(String(selectedCar.name || 'Vehicle'));
          const applicantNameForSubject = sanitizeEmailHeaderValue(
            normalizedApplicationData.name
          );
          const emailResults = await Promise.allSettled([
            sendResendEmail(resend, {
              from: 'Maple Rentals Notifications <noreply@maplerentals.com.au>',
              to: adminEmail,
              subject: `New Driver Application: ${applicantNameForSubject}`,
              html: `
                <div style="font-family: sans-serif; color: #1a202c;">
                  <h2>New Driver Application</h2>
                  <p>A new driver application has been submitted and is waiting for review.</p>
                  <ul>
                    <li><strong>Name:</strong> ${safeApplicantName}</li>
                    <li><strong>Phone:</strong> ${safeApplicantPhone}</li>
                    <li><strong>Email:</strong> ${safeApplicantEmail}</li>
                    <li><strong>Address:</strong> ${safeApplicantAddress}</li>
                    <li><strong>Uber Status:</strong> ${safeUberStatus}</li>
                    <li><strong>Experience:</strong> ${safeExperience}</li>
                    <li><strong>Intended Start:</strong> ${safeIntendedStart}</li>
                    <li><strong>Requested Vehicle:</strong> ${safeCarName}</li>
                  </ul>
                  <p>Review the application in the admin dashboard before issuing any payment link.</p>
                </div>
              `,
            }),
            sendResendEmail(resend, {
              from: 'Maple Rentals <noreply@maplerentals.com.au>',
              to: normalizedApplicationData.email,
              subject: 'We received your Maple Rentals application',
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c;">
                  <h2 style="color: #D4AF37;">Application Received</h2>
                  <p>Hi ${safeApplicantName},</p>
                  <p>Thanks for applying to rent the ${safeCarName}.</p>
                  <p>Our team is reviewing your documents now. If your application is approved, we will email you a secure checkout link with the final pricing and agreement.</p>
                  <p><strong>Application reference:</strong> ${applicationId}</p>
                  <p>Best regards,<br /><strong>The Maple Rentals Team</strong></p>
                </div>
              `,
            }),
          ]);
          for (const result of emailResults) {
            if (result.status === 'rejected') {
              console.error('Failed to send application review email:', result.reason);
            }
          }
        } catch (emailError) {
          // Catches errors from getResend() initialization (e.g. missing API key at call time).
          // Individual send() failures are handled above via Promise.allSettled.
          console.error('Failed to initialise email client for application review:', emailError);
        }
      }
      

      res.json({
        success: true,
        application_id: applicationId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }

      await removeUploadedApplicationDocuments(uploadedPaths);

      if (err instanceof Error && 'status' in err && typeof err.status === 'number') {
        return res.status(err.status).json({ error: err.message });
      }

      if (err instanceof VehicleAllocationConflictError) {
        return res.status(err.status).json({ error: err.message });
      }

      if (isVehicleAllocationUniqueConstraintError(err)) {
        return res.status(409).json({
          error: 'Selected vehicle is no longer available. Please choose another vehicle.',
        });
      }

      console.error('Application submission error:', err);
      res.status(500).json({ error: 'Application submission failed' });
    }
  }
);

router.post('/:id/approve-payment', authenticateAdmin, async (req, res) => {
  try {
    const payload = applicationApprovalSchema.parse({
      ...req.body,
      application_id: req.params.id,
    });

    if (payload.send_payment_link) {
      assertTransactionalPaymentProcessing(ADMIN_PAYMENTS_RESTRICTED_MESSAGE);
    }

    const selectColumns = await getApplicationSelectColumns();
    const { data: application, error: applicationError } = await db
      .from('applications')
      .select(selectColumns)
      .eq('id', payload.application_id)
      .single();

    if (applicationError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const applicationRecord = application as unknown as ApplicationPaymentApprovalRecord;
    const applicationDetails = application as Record<string, any>;

    if (applicationRecord.status === 'Paid') {
      return res.status(409).json({ error: 'This application has already been paid.' });
    }

    if (applicationRecord.status === 'Payment Review') {
      return res.status(409).json({
        error:
          'This application has already been paid and is awaiting rental activation. Do not send a new payment link.',
      });
    }

    if (applicationRecord.status === 'Rejected') {
      return res.status(409).json({ error: 'Rejected applications cannot be approved for payment.' });
    }

    const { data: car, error: carError } = await db
      .from('cars')
      .select(await getCarSelectColumns())
      .eq('id', payload.assigned_car_id)
      .single();

    if (carError || !car) {
      return res.status(404).json({ error: 'Assigned vehicle not found' });
    }

    if (car.status !== 'Available') {
      return res.status(409).json({ error: 'Assigned vehicle is not available.' });
    }

    await assertVehicleAllocationAvailable({
      applicationId: payload.application_id,
      carId: payload.assigned_car_id,
      message:
        'Assigned vehicle already has another active approval or payment review. Resolve that allocation first.',
    });

    const currentVersion = Number(applicationRecord.payment_link_version || 0);
    const nextVersion = currentVersion + 1;
    const nowIso = new Date().toISOString();

    if (applicationRecord.pending_checkout_session_id) {
      try {
        await getStripe().checkout.sessions.expire(applicationRecord.pending_checkout_session_id);
      } catch (expireError) {
        console.warn(
          `Unable to expire pending checkout session ${applicationRecord.pending_checkout_session_id}:`,
          expireError
        );
      }
    }

    const updatedApplication =
      await updateApplicationPaymentStateIfCurrentVersion({
        applicationId: payload.application_id,
        expectedPaymentLinkVersion: currentVersion,
        payload: {
          approved_at: nowIso,
          approved_bond: payload.approved_bond,
          approved_weekly_price: payload.approved_weekly_price,
          assigned_car_id: payload.assigned_car_id,
          paid_at: null,
          payment_link_sent_at: payload.send_payment_link ? nowIso : null,
          payment_link_version: nextVersion,
          pending_checkout_session_id: null,
          status: 'Approved',
        },
      });

    if (!updatedApplication) {
      return res.status(409).json({
        error:
          'Application payment details changed while approving. Refresh and try again.',
      });
    }

    const checkoutToken = createCheckoutToken({
      applicationId: payload.application_id,
      carId: payload.assigned_car_id,
      purpose: 'vehicle',
      version: nextVersion,
    });
    const checkoutUrl = buildDriverPaymentLink({
      applicationId: payload.application_id,
      carId: payload.assigned_car_id,
      token: checkoutToken.token,
    });

    const agreementContent = renderApplicationLeaseAgreement(
      applicationDetails,
      car as Record<string, any>,
      payload.approved_weekly_price,
      nowIso,
      payload.approved_bond
    );

    let leaseAgreementSaved = false;
    try {
      await saveLeaseAgreement({
        applicationId: payload.application_id,
        carId: payload.assigned_car_id,
        content: agreementContent,
      });
      leaseAgreementSaved = true;
    } catch (agreementError) {
      console.error('Lease agreement save error:', agreementError);
    }

    let emailDelivery = {
      delivered: false,
      reason: null as string | null,
    };

    if (payload.send_payment_link) {
      emailDelivery = await sendDriverPaymentLinkEmail({
        applicantEmail: applicationRecord.email,
        applicantName: applicationRecord.name,
        approvedBond: payload.approved_bond,
        approvedWeeklyPrice: payload.approved_weekly_price,
        carName: car.name,
        checkoutUrl,
        setupFees: RENTAL_PLAN_SETUP_FEES_AUD,
        agreement: agreementContent,
      });
    }

    res.json({
      success: true,
      checkout_token: checkoutToken.token,
      checkout_token_expires_at: checkoutToken.expiresAt,
      checkout_url: checkoutUrl,
      email_delivered: emailDelivery.delivered,
      email_reason: emailDelivery.reason,
      lease_agreement_saved: leaseAgreementSaved,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    if (error instanceof VehicleAllocationConflictError) {
      return res.status(error.status).json({ error: error.message });
    }

    if (isVehicleAllocationUniqueConstraintError(error)) {
      return res.status(409).json({
        error:
          'Assigned vehicle already has another active approval or payment review. Resolve that allocation first.',
      });
    }

    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('payment details changed')
    ) {
      return res.status(409).json({ error: error.message });
    }

    if (error instanceof Error && 'status' in error && error.status === 503) {
      return res.status(503).json({ error: error.message });
    }

    console.error('Application approve-payment error:', error);
    res.status(500).json({ error: 'Failed to approve application for payment' });
  }
});

router.post('/:id/retry-payment-activation', authenticateAdmin, async (req, res) => {
  try {
    const applicationId = uuidSchema.parse(req.params.id);
    const selectColumns = await getApplicationSelectColumns();
    const { data: application, error: applicationError } = await db
      .from('applications')
      .select(selectColumns)
      .eq('id', applicationId)
      .single();

    if (applicationError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const applicationRecord = application as unknown as ApplicationPaymentApprovalRecord;

    if (applicationRecord.status !== 'Payment Review') {
      return res.status(409).json({
        error: 'Only paid applications awaiting activation can be retried.',
      });
    }

    if (!applicationRecord.assigned_car_id) {
      return res.status(409).json({
        error: 'This payment review is missing its assigned vehicle.',
      });
    }

    const checkoutSession = await recoverPaymentReviewSession(applicationRecord);
    if (!checkoutSession || !checkoutSession.subscription) {
      return res.status(409).json({
        error:
          'We could not recover the paid checkout session for this application. Reconcile this payment manually in Stripe.',
      });
    }

    await handleVehicleCheckoutCompletion(checkoutSession);

    const { data: refreshedApplication, error: refreshedApplicationError } = await db
      .from('applications')
      .select(selectColumns)
      .eq('id', applicationId)
      .single();

    if (refreshedApplicationError || !refreshedApplication) {
      throw refreshedApplicationError || new Error('Application disappeared after activation retry.');
    }

    const refreshedRecord = refreshedApplication as unknown as ApplicationPaymentApprovalRecord;
    if (refreshedRecord.status !== 'Paid') {
      return res.status(409).json({
        error:
          'Activation is still blocked. Resolve the vehicle conflict or maintenance hold, then retry again.',
      });
    }

    res.json({ success: true, status: refreshedRecord.status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
      return res.status(error.status).json({ error: error.message });
    }

    console.error('Application retry-payment-activation error:', error);
    res.status(500).json({ error: 'Failed to retry payment activation' });
  }
});

router.put('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = z.object({ id: uuidSchema }).parse(req.params);
    const { data: existingApplication, error: applicationLookupError } = await db
      .from('applications')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (applicationLookupError) {
      throw applicationLookupError;
    }

    if (!existingApplication) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const { status } = z.object({ status: applicationStatusEnum }).parse(req.body ?? {});
    if (status === 'Approved' || status === 'Paid' || status === 'Payment Review') {
      return res.status(400).json({
        error:
          'Use the payment approval flow to approve applications. Paid and Payment Review statuses are set by Stripe processing.',
      });
    }
    const { error } = await db.from('applications').update({ status }).eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('Application update error:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

export default router;
