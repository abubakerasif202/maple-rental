import express from "express";
import rateLimit from "express-rate-limit";
import multer, { MulterError } from "multer";
import type Stripe from "stripe";

import { updateApplicationPaymentStateIfCurrentVersion } from "../applicationPaymentState.js";
import { db } from "../db/index.js";
import { authenticateAdmin } from "../middleware/auth.js";
import { getStripeClient } from "../stripeClient.js";
import {
  applicationApprovalSchema,
  applicationSchema,
  applicationStatusEnum,
  uuidSchema,
} from "../validation.js";
import { z } from "zod";
import crypto from "crypto";
import { createCheckoutToken } from "../checkoutTokens.js";
import {
  getApplicationCreatedAtColumn,
  getApplicationDuplicateCheckColumns,
  getApplicationDocumentColumn,
  getApplicationSelectColumns,
  toApplicationWritePayload,
} from "../schemaCompat.js";
import {
  FALLBACK_ADMIN_EMAIL,
  RENTAL_PLAN_SETUP_FEES_AUD,
} from "../constants.js";
import {
  buildDriverPaymentLink,
  sendDriverPaymentLinkEmail,
} from "../paymentLinks.js";
import { handleVehicleCheckoutCompletion } from "../paymentActivation.js";
import {
  cancelApplicationStripeResources,
  expirePendingCheckoutSession,
} from "../services/stripeCheckoutService.js";
import { withVehicleCheckoutProcessingLock } from "../paymentActivation.js";
import {
  APPLICATION_IMAGE_CONTENT_TYPES,
  APPLICATION_DOCUMENT_CONTENT_TYPES,
  normalizeApplicationEmail,
  MAX_APPLICATION_UPLOAD_BYTES,
} from "../../shared/applicationSubmission.js";
import {
  renderActiveAgreementTemplate,
} from "../agreementTemplates.js";
import {
  escapeHtml,
  getResend,
  sanitizeEmailHeaderValue,
  sendResendEmail,
} from "../email.js";
import { normalizeUuid } from "../../shared/uuid.js";
import { isImportedApplicationRecord } from "../importedDataFilters.js";

const router = express.Router();
const APPLICATIONS_BUCKET = "applications";
const DOCUMENT_URL_TTL_SECONDS = 60 * 15;
const APPLICATION_LIST_DOCUMENT_SIGNING_LIMIT = 100;
const ALLOWED_APPLICATION_IMAGE_TYPES = new Set<string>(
  APPLICATION_IMAGE_CONTENT_TYPES,
);
const ALLOWED_APPLICATION_DOCUMENT_TYPES = new Set<string>(
  APPLICATION_DOCUMENT_CONTENT_TYPES,
);
const APPLICATION_FILE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_MAGIC = Buffer.from("%PDF-");

const detectImageMagicType = (
  buffer: Buffer,
): "image/png" | "image/jpeg" | null => {
  if (
    buffer.length >= PNG_MAGIC.length &&
    buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
  ) {
    return "image/png";
  }

  if (
    buffer.length >= JPEG_MAGIC.length &&
    buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)
  ) {
    return "image/jpeg";
  }

  return null;
};

const detectDocumentMagicType = (
  buffer: Buffer,
): "image/png" | "image/jpeg" | "application/pdf" | null => {
  const imageType = detectImageMagicType(buffer);
  if (imageType) {
    return imageType;
  }

  if (
    buffer.length >= PDF_MAGIC.length &&
    buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
  ) {
    return "application/pdf";
  }

  return null;
};

const normalizeDeclaredImageType = (value: string) => {
  const normalized = value.toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
};
const normalizeDeclaredDocumentType = (value: string) => {
  const normalized = normalizeDeclaredImageType(value);
  return normalized === "application/x-pdf" ? "application/pdf" : normalized;
};
const getStripe = () => getStripeClient();

router.get("/agreement-template", async (_req, res) => {
  res.json(await renderActiveAgreementTemplate());
});

type ApplicationUploadField =
  | "license_photo"
  | "license_back_photo"
  | "passport_or_uber_profile_screenshot"
  | "proof_of_address_document"
  | "additional_document";
type UploadedApplicationFiles = Partial<
  Record<ApplicationUploadField, Express.Multer.File[]>
>;

const applicationUpload = multer({
  limits: {
    fileSize: MAX_APPLICATION_UPLOAD_BYTES,
    files: 5,
  },
  storage: multer.memoryStorage(),
});

const applicationSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many applications submitted. Please try again later.",
  },
  skip: () => process.env.VITEST === "true",
});

const applicationUploadMiddleware: express.RequestHandler = (
  req,
  res,
  next,
) => {
  applicationUpload.fields([
    { name: "license_photo", maxCount: 1 },
    { name: "license_back_photo", maxCount: 1 },
    { name: "passport_or_uber_profile_screenshot", maxCount: 1 },
    { name: "proof_of_address_document", maxCount: 1 },
    { name: "additional_document", maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `Application documents must be smaller than ${Math.floor(
              MAX_APPLICATION_UPLOAD_BYTES / (1024 * 1024),
            )} MB.`
          : "Invalid multipart upload.";
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
    const prefix = SUPABASE_STORAGE_PATH_PREFIXES.find((candidate) =>
      pathname.includes(candidate),
    );

    if (!prefix) {
      return null;
    }

    return decodeURIComponent(
      pathname.slice(pathname.indexOf(prefix) + prefix.length),
    );
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
      String((error as { statusCode?: string }).statusCode || "") === "404" ||
      String((error as { status?: number }).status || "") === "404"
    ) {
      console.warn(
        `Application document not found in storage bucket for ${storagePath}; returning null signed URL.`,
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
  approved_vehicle?: string | null;
  approved_weekly_price?: number | null;
  email: string;
  id: string;
  name: string;
  payment_link_version?: number | null;
  pending_checkout_session_id?: string | null;
  status: string;
};

const isRecoverableVehicleCheckoutSession = (
  session: Stripe.Checkout.Session,
  application: ApplicationPaymentApprovalRecord,
) =>
  session.status === "complete" &&
  session.payment_status === "paid" &&
  session.metadata?.checkout_kind === "vehicle" &&
  normalizeUuid(session.metadata?.application_id || "") ===
    normalizeUuid(application.id) &&
  Number(session.metadata?.payment_link_version || 0) ===
    Number(application.payment_link_version || 0);

const recoverPaymentReviewSession = async (
  application: ApplicationPaymentApprovalRecord,
) => {
  const storedSessionId = application.pending_checkout_session_id;

  if (!storedSessionId) {
    return null;
  }

  try {
    const session =
      await getStripe().checkout.sessions.retrieve(storedSessionId);
    if (isRecoverableVehicleCheckoutSession(session, application)) {
      return session;
    }
  } catch (error) {
    console.warn(
      `Unable to retrieve stored checkout session ${storedSessionId}:`,
      error,
    );
  }

  return null;
};

const getApplicationBackPhotoValue = (application: Record<string, any>) =>
  application.license_back_photo ??
  application.uber_screenshot ??
  application.uberScreenshot ??
  null;

const getApplicationPassportDocumentValue = (application: Record<string, any>) =>
  application.passport_or_uber_profile_screenshot ??
  application.passportOrUberProfileScreenshot ??
  null;

const createRequestError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const removeUploadedApplicationDocuments = async (paths: string[]) => {
  if (paths.length === 0) {
    return;
  }

  const { error } = await db.storage.from(APPLICATIONS_BUCKET).remove(paths);

  if (error) {
    console.warn("Failed to clean up uploaded application documents:", error);
  }
};

const getUploadedApplicationFile = (
  files: UploadedApplicationFiles,
  field: ApplicationUploadField,
  fieldLabel: string,
) => {
  const file = files[field]?.[0];

  if (!file) {
    throw createRequestError(400, `${fieldLabel} is required.`);
  }

  const isPassportDocument =
    field === "passport_or_uber_profile_screenshot";
  const allowedTypes = isPassportDocument
    ? ALLOWED_APPLICATION_DOCUMENT_TYPES
    : ALLOWED_APPLICATION_IMAGE_TYPES;

  if (!allowedTypes.has(file.mimetype.toLowerCase())) {
    throw createRequestError(
      400,
      isPassportDocument
        ? `${fieldLabel} must be a JPG, PNG, or PDF file.`
        : `${fieldLabel} must be a JPG or PNG image.`,
    );
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw createRequestError(400, `${fieldLabel} could not be read.`);
  }

  if (file.size > MAX_APPLICATION_UPLOAD_BYTES) {
    throw createRequestError(400, `${fieldLabel} must be smaller than 7 MB.`);
  }

  // Header-only MIME checks are trivially spoofable. Require the file's magic
  // bytes to match the declared content type so an .exe renamed to .jpg can't
  // land in the applications bucket.
  const detectedType = isPassportDocument
    ? detectDocumentMagicType(file.buffer)
    : detectImageMagicType(file.buffer);
  const declaredType = isPassportDocument
    ? normalizeDeclaredDocumentType(file.mimetype)
    : normalizeDeclaredImageType(file.mimetype);
  if (!detectedType || detectedType !== declaredType) {
    throw createRequestError(
      400,
      isPassportDocument
        ? `${fieldLabel} file contents do not match a JPG, PNG, or PDF file.`
        : `${fieldLabel} file contents do not match a JPG or PNG image.`,
    );
  }

  return file;
};

const getOptionalUploadedApplicationFile = (
  files: UploadedApplicationFiles,
  field: ApplicationUploadField,
) => files[field]?.[0] || null;

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
    APPLICATION_FILE_EXTENSION_BY_CONTENT_TYPE[normalizedContentType] || "bin";
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${filePrefix}.${extension}`;

  const { data: uploadData, error: uploadError } = await db.storage
    .from(APPLICATIONS_BUCKET)
    .upload(filename, file.buffer, {
      contentType: normalizedContentType,
      upsert: false,
    });

  if (uploadError) {
    console.error(`Error uploading ${filePrefix}:`, uploadError);
    throw createRequestError(
      500,
      `Failed to upload ${fieldLabel.toLowerCase()}.`,
    );
  }

  const uploadedPath = uploadData.path || filename;
  uploadedPaths.push(uploadedPath);
  return uploadedPath;
};

router.get("/", authenticateAdmin, async (_req, res) => {
  try {
    const selectColumns = await getApplicationSelectColumns();
    const orderColumn = await getApplicationCreatedAtColumn();
    const { data, error } = await db
      .from("applications")
      .select(selectColumns)
      .order(orderColumn, { ascending: false });
    if (error) {
      return res.status(500).json({ error: "Failed to fetch applications" });
    }

    const rows = ((data || []) as Array<Record<string, any>>).filter(
      (application) => !isImportedApplicationRecord(application),
    );
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
            passport_or_uber_profile_screenshot: null,
          };
        }

        return {
          ...rest,
          license_photo: await createSignedDocumentUrl(
            application.license_photo,
          ),
          license_back_photo: await createSignedDocumentUrl(
            getApplicationBackPhotoValue(application),
          ),
          passport_or_uber_profile_screenshot: await createSignedDocumentUrl(
            getApplicationPassportDocumentValue(application),
          ),
        };
      }),
    );

    res.json(applications);
  } catch (error) {
    console.error("Fetch applications error:", error);
    res.status(500).json({ error: "Failed to process applications" });
  }
});

router.get("/:id/documents/:document", authenticateAdmin, async (req, res) => {
  try {
    const { id, document } = z
      .object({
        id: uuidSchema,
        document: z.enum([
          "license_photo",
          "license_back_photo",
          "passport_or_uber_profile_screenshot",
        ]),
      })
      .parse(req.params);

    const documentColumn = await getApplicationDocumentColumn(document);
    const selectColumn =
      documentColumn === document ? document : `${document}:${documentColumn}`;

    const { data: application, error } = await db
      .from("applications")
      .select(`id, ${selectColumn}`)
      .eq("id", id)
      .single();

    if (error || !application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const documentValue =
      application[document] ??
      (document === "license_back_photo"
        ? getApplicationBackPhotoValue(application)
        : document === "passport_or_uber_profile_screenshot"
          ? getApplicationPassportDocumentValue(application)
        : null);
    const signedUrl = await createSignedDocumentUrl(documentValue);
    if (!signedUrl) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ url: signedUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: error.issues });
    }

    console.error("Application document fetch error:", error);
    res.status(500).json({ error: "Failed to fetch application document" });
  }
});

router.post(
  "/",
  applicationSubmissionLimiter,
  applicationUploadMiddleware,
  async (req, res) => {
    const uploadedPaths: string[] = [];

    try {
      const data = applicationSchema.parse(req.body);
      const email = data.email;
      const phone = data.phone;

      if (!email) {
        throw createRequestError(400, "Email is required.");
      }

      if (!phone) {
        throw createRequestError(400, "Phone is required.");
      }

      const files = (req.files || {}) as UploadedApplicationFiles;
      const licensePhotoFile = getUploadedApplicationFile(
        files,
        "license_photo",
        "Driver licence front photo",
      );
      const licenseBackPhotoFile = getUploadedApplicationFile(
        files,
        "license_back_photo",
        "Driver licence back photo",
      );
      const passportDocumentFile = getUploadedApplicationFile(
        files,
        "passport_or_uber_profile_screenshot",
        "Proof of address document",
      );
      const proofOfAddressFile = getUploadedApplicationFile(
        files,
        "proof_of_address_document",
        "Proof of address document",
      );
      const additionalDocumentFile = getOptionalUploadedApplicationFile(
        files,
        "additional_document",
      );

      const normalizedApplicationData = {
        ...data,
        email,
        phone,
      };
      let licensePhotoUrl = null;
      let licenseBackPhotoUrl = null;
      const existingApplicationSelectColumns =
        await getApplicationDuplicateCheckColumns();
      const { data: existingApplications, error: existingApplicationError } =
        await db
          .from("applications")
          .select(existingApplicationSelectColumns)
          .ilike("email", normalizedApplicationData.email);

      if (existingApplicationError) {
        throw existingApplicationError;
      }

      const matchingApplications = (
        (existingApplications ?? []) as Array<Record<string, any>>
      ).filter(
        (application) =>
          normalizeApplicationEmail(String(application.email ?? "")) ===
          normalizedApplicationData.email,
      );

      const existingRow = matchingApplications[0] ?? null;

      if (existingRow) {
        if (
          existingRow.phone !== normalizedApplicationData.phone ||
          existingRow.license_number !==
            normalizedApplicationData.license_number
        ) {
          return res.status(409).json({
            error:
              "An application already exists for this email. Contact support to continue.",
          });
        }

        if (existingRow.status === "Pending") {
          return res.status(409).json({
            error:
              "This application is already under review. Contact support if you need to update it.",
          });
        }

        if (existingRow.status === "Rejected") {
          return res.status(409).json({
            error:
              "This application has already been reviewed. Contact support to reopen it securely.",
          });
        }

        if (
          ["Approved", "Paid", "Payment Review"].includes(
            String(existingRow.status),
          )
        ) {
          return res.status(409).json({
            error:
              "This application has already been submitted and is being processed.",
          });
        }
      }

      licensePhotoUrl = await uploadApplicationFile({
        file: licensePhotoFile,
        filePrefix: "license-front",
        fieldLabel: "Driver licence front photo",
        uploadedPaths,
      });
      licenseBackPhotoUrl = await uploadApplicationFile({
        file: licenseBackPhotoFile,
        filePrefix: "license-back",
        fieldLabel: "Driver licence back photo",
        uploadedPaths,
      });
      const passportDocumentUrl = await uploadApplicationFile({
        file: passportDocumentFile,
        filePrefix: "passport-or-uber-profile-screenshot",
        fieldLabel: "Proof of address document",
        uploadedPaths,
      });
      const proofOfAddressUrl = await uploadApplicationFile({
        file: proofOfAddressFile,
        filePrefix: "proof-of-address-document",
        fieldLabel: "Proof of address document",
        uploadedPaths,
      });
      const additionalDocumentUrl = additionalDocumentFile
        ? await uploadApplicationFile({
            file: additionalDocumentFile,
            filePrefix: "additional-document",
            fieldLabel: "Additional document",
            uploadedPaths,
          })
        : null;

      const {
        weekly_budget: _weeklyBudget,
        ...submissionDataWithoutBudget
      } = normalizedApplicationData;
      const basePayload = await toApplicationWritePayload({
        ...submissionDataWithoutBudget,
        license_photo: licensePhotoUrl,
        license_back_photo: licenseBackPhotoUrl,
        passport_or_uber_profile_screenshot: passportDocumentUrl,
        proof_of_address_document: proofOfAddressUrl,
        additional_document: additionalDocumentUrl,
        agreement_accepted_at: new Date().toISOString(),
        agreement_signature: String(data.agreement_signature || "").trim(),
        agreement_template_version: (await renderActiveAgreementTemplate()).agreementTemplateVersion,
        status: "Pending",
      });
      const { data: inserted, error } = await db
        .from("applications")
        .insert([basePayload])
        .select("id")
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
          const safeApplicantEmail = escapeHtml(
            normalizedApplicationData.email,
          );
          const safeApplicantPhone = escapeHtml(
            normalizedApplicationData.phone,
          );
          const safeApplicantAddress = escapeHtml(
            normalizedApplicationData.address,
          );
          const safeUberStatus = escapeHtml(
            normalizedApplicationData.uber_status,
          );
          const safeExperience = escapeHtml(
            normalizedApplicationData.experience,
          );
          const safeIntendedStart = escapeHtml(
            normalizedApplicationData.intended_start_date,
          );
          const applicantNameForSubject = sanitizeEmailHeaderValue(
            normalizedApplicationData.name,
          );
          const emailResults = await Promise.allSettled([
            sendResendEmail(resend, {
              from: "Gala Rentals Notifications <noreply@galarentals.com.au>",
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
                  </ul>
                  <p>Review the application in the admin dashboard, confirm the approved vehicle and pricing, then issue the Stripe payment link.</p>
                </div>
              `,
            }),
            sendResendEmail(resend, {
              from: "Gala Rentals <noreply@galarentals.com.au>",
              to: normalizedApplicationData.email,
              subject: "We received your Gala Rentals application",
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c;">
                  <h2 style="color: #D4AF37;">Application Received</h2>
                  <p>Hi ${safeApplicantName},</p>
                  <p>Thanks for applying to drive with Gala Rentals.</p>
                  <p>Our team is reviewing your documents now. If your application is approved, we will email you a secure checkout link with the final pricing and agreement.</p>
                  <p><strong>Application reference:</strong> ${applicationId}</p>
                  <p>Best regards,<br /><strong>The Gala Rentals Team</strong></p>
                </div>
              `,
            }),
          ]);
          for (const result of emailResults) {
            if (result.status === "rejected") {
              console.error(
                "Failed to send application review email:",
                result.reason,
              );
            }
          }
        } catch (emailError) {
          // Catches errors from getResend() initialization (e.g. missing API key at call time).
          // Individual send() failures are handled above via Promise.allSettled.
          console.error(
            "Failed to initialise email client for application review:",
            emailError,
          );
        }
      }

      res.json({
        success: true,
        application_id: applicationId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Validation failed", details: err.issues });
      }

      await removeUploadedApplicationDocuments(uploadedPaths);

      if (
        err instanceof Error &&
        "status" in err &&
        typeof err.status === "number"
      ) {
        return res.status(err.status).json({ error: err.message });
      }

      console.error("Application submission error:", err);
      res.status(500).json({ error: "Application submission failed" });
    }
  },
);

router.post("/:id/approve-payment", authenticateAdmin, async (req, res) => {
  try {
    const payload = applicationApprovalSchema.parse({
      ...req.body,
      application_id: req.params.id,
    });

    const selectColumns = await getApplicationSelectColumns();
    const { data: application, error: applicationError } = await db
      .from("applications")
      .select(selectColumns)
      .eq("id", payload.application_id)
      .single();

    if (applicationError || !application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const applicationRecord =
      application as unknown as ApplicationPaymentApprovalRecord;
    if (applicationRecord.status === "Paid") {
      return res
        .status(409)
        .json({ error: "This application has already been paid." });
    }

    if (applicationRecord.status === "Payment Review") {
      return res.status(409).json({
        error:
          "This application has already been paid and is awaiting onboarding follow-up. Do not send a new payment link.",
      });
    }

    if (applicationRecord.status === "Rejected") {
      return res
        .status(409)
        .json({
          error: "Rejected applications cannot be approved for payment.",
        });
    }

    if (applicationRecord.status === "Cancelled") {
      return res
        .status(409)
        .json({
          error: "Cancelled applications cannot be approved for payment.",
        });
    }

    const currentVersion = Number(applicationRecord.payment_link_version || 0);
    const nextVersion = currentVersion + 1;
    const nowIso = new Date().toISOString();

    await expirePendingCheckoutSession(
      applicationRecord.pending_checkout_session_id,
    );

    const updatedApplication =
      await updateApplicationPaymentStateIfCurrentVersion({
        applicationId: payload.application_id,
        expectedPaymentLinkVersion: currentVersion,
        payload: {
          approved_at: nowIso,
          approved_bond: payload.approved_bond,
          approved_vehicle: payload.approved_vehicle.trim(),
          approved_weekly_price: payload.approved_weekly_price,
          assigned_car_id: null,
          ...(payload.rental_subscription_start_date
            ? { intended_start_date: payload.rental_subscription_start_date }
            : {}),
          paid_at: null,
          payment_link_sent_at: payload.send_payment_link ? nowIso : null,
          payment_link_version: nextVersion,
          pending_checkout_session_id: null,
          status: "Approved",
        },
      });

    if (!updatedApplication) {
      return res.status(409).json({
        error:
          "Application payment details changed while approving. Refresh and try again.",
      });
    }

    const checkoutToken = createCheckoutToken({
      applicationId: payload.application_id,
      carId: null,
      purpose: "vehicle",
      version: nextVersion,
    });
    const checkoutUrl = buildDriverPaymentLink({
      applicationId: payload.application_id,
      token: checkoutToken.token,
    });

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
        approvedVehicle: payload.approved_vehicle.trim(),
        checkoutUrl,
        setupFees: RENTAL_PLAN_SETUP_FEES_AUD,
      });
    }

    res.json({
      success: true,
      checkout_token: checkoutToken.token,
      checkout_token_expires_at: checkoutToken.expiresAt,
      checkout_url: checkoutUrl,
      email_delivered: emailDelivery.delivered,
      email_reason: emailDelivery.reason,
      lease_agreement_saved: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: error.issues });
    }

    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("payment details changed")
    ) {
      return res.status(409).json({ error: error.message });
    }

    if (error instanceof Error && "status" in error && error.status === 503) {
      return res.status(503).json({ error: error.message });
    }

    console.error("Application approve-payment error:", error);
    res
      .status(500)
      .json({ error: "Failed to approve application for payment" });
  }
});

router.post(
  "/:id/retry-payment-activation",
  authenticateAdmin,
  async (req, res) => {
    try {
      const applicationId = uuidSchema.parse(req.params.id);
      const selectColumns = await getApplicationSelectColumns();
      const { data: application, error: applicationError } = await db
        .from("applications")
        .select(selectColumns)
        .eq("id", applicationId)
        .single();

      if (applicationError || !application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const applicationRecord =
        application as unknown as ApplicationPaymentApprovalRecord;

      if (applicationRecord.status === "Cancelled") {
        return res.status(409).json({
          error: "Cancelled applications cannot be retried.",
        });
      }

      if (applicationRecord.status !== "Payment Review") {
        return res.status(409).json({
          error: "Only paid applications awaiting onboarding follow-up can be retried.",
        });
      }

      const checkoutSession =
        await recoverPaymentReviewSession(applicationRecord);
      if (!checkoutSession || !checkoutSession.subscription) {
        return res.status(409).json({
          error:
            "We could not recover the paid checkout session for this application. Reconcile this payment manually in Stripe.",
        });
      }

      await handleVehicleCheckoutCompletion(checkoutSession);

      const { data: refreshedApplication, error: refreshedApplicationError } =
        await db
          .from("applications")
          .select(selectColumns)
          .eq("id", applicationId)
          .single();

      if (refreshedApplicationError || !refreshedApplication) {
        throw (
          refreshedApplicationError ||
          new Error("Application disappeared after activation retry.")
        );
      }

      const refreshedRecord =
        refreshedApplication as unknown as ApplicationPaymentApprovalRecord;
      if (refreshedRecord.status !== "Paid") {
        return res.status(409).json({
          error:
            "Payment finalization is still blocked. Retry again or reconcile the Stripe session manually.",
        });
      }

      res.json({ success: true, status: refreshedRecord.status });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Validation failed", details: error.issues });
      }

      if (
        error instanceof Error &&
        "status" in error &&
        typeof error.status === "number"
      ) {
        return res.status(error.status).json({ error: error.message });
      }

      console.error("Application retry-payment-activation error:", error);
      res.status(500).json({ error: "Failed to retry payment activation" });
    }
  },
);

router.post("/:id/cancel", authenticateAdmin, async (req, res) => {
  try {
    const { id } = z.object({ id: uuidSchema }).parse(req.params);
    const { cancel_reason } = z
      .object({ cancel_reason: z.string().trim().max(500).optional() })
      .parse(req.body ?? {});

    const result = await withVehicleCheckoutProcessingLock(id, async () => {
      const selectColumns = await getApplicationSelectColumns();
      const { data: application, error: applicationError } = await db
        .from("applications")
        .select(selectColumns)
        .eq("id", id)
        .single();

      if (applicationError || !application) {
        return { error: createRequestError(404, "Application not found") } as const;
      }

      const applicationRecord =
        application as unknown as ApplicationPaymentApprovalRecord & {
          cancelled_at?: string | null;
          cancel_reason?: string | null;
        };

      if (applicationRecord.status === "Cancelled") {
        return {
          success: true,
          application_status: "Cancelled" as const,
        } as const;
      }

      const currentVersion = Number(applicationRecord.payment_link_version || 0);
      const nextVersion = currentVersion + 1;
      const nowIso = new Date().toISOString();

      const updatedApplication =
        await updateApplicationPaymentStateIfCurrentVersion({
          applicationId: id,
          expectedPaymentLinkVersion: currentVersion,
          payload: {
            payment_link_version: nextVersion,
            pending_checkout_session_id: null,
            cancelled_at: nowIso,
            cancel_reason: cancel_reason || null,
            status: "Cancelled",
          },
        });

      if (!updatedApplication) {
        return {
          error: createRequestError(
            409,
            "Application payment details changed while cancelling. Refresh and try again.",
          ),
        } as const;
      }

      await cancelApplicationStripeResources({
        applicationId: id,
        paymentLinkVersion: currentVersion,
        pendingCheckoutSessionId:
          applicationRecord.pending_checkout_session_id || null,
      });

      return {
        success: true,
        application_status: "Cancelled" as const,
      } as const;
    });

    if ("error" in result) {
      throw result.error;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: error.issues });
    }

    if (
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number"
    ) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Application cancel error:", error);
    res.status(500).json({ error: "Failed to cancel application" });
  }
});

router.put("/:id/status", authenticateAdmin, async (req, res) => {
  try {
    const { id } = z.object({ id: uuidSchema }).parse(req.params);
    const { data: existingApplication, error: applicationLookupError } =
      await db.from("applications").select("id").eq("id", id).maybeSingle();

    if (applicationLookupError) {
      throw applicationLookupError;
    }

    if (!existingApplication) {
      return res.status(404).json({ error: "Application not found" });
    }

    const { status } = z
      .object({ status: applicationStatusEnum })
      .parse(req.body ?? {});
    if (
      status === "Approved" ||
      status === "Paid" ||
      status === "Payment Review" ||
      status === "Cancelled"
    ) {
      return res.status(400).json({
        error:
          "Use the payment approval flow to approve applications. Paid, Payment Review, and Cancelled statuses are set by dedicated flows.",
      });
    }
    const { error } = await db
      .from("applications")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: error.issues });
    }
    console.error("Application update error:", error);
    res.status(500).json({ error: "Failed to update application status" });
  }
});

export default router;
