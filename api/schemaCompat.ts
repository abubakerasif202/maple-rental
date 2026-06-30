type SchemaMode = 'snake' | 'camel';

import { calculateBondFromWeeklyRent } from '../shared/rentalPricing.js';

type OpenApiDefinition = {
  properties?: Record<string, unknown>;
};

type ApplicationBackPhotoColumn =
  | 'license_back_photo'
  | 'licenseBackPhoto'
  | 'uber_screenshot'
  | 'uberScreenshot';

type ApplicationPassportDocumentColumn =
  | 'passport_or_uber_profile_screenshot'
  | 'passportOrUberProfileScreenshot';

type ApplicationAgreementTemplateVersionColumn =
  | 'agreement_template_version'
  | 'agreementTemplateVersion';

type SchemaCompat = {
  applicationApprovedAtColumn: string;
  applicationApprovedVehicleColumn: string;
  applicationIntendedStartDateColumn: string;
  applicationAgreementAcceptedAtColumn: string;
  applicationAgreementSignatureColumn: string;
  applicationAgreementTemplateVersionColumn: ApplicationAgreementTemplateVersionColumn;
  carArchivedAtColumn: string;
  carCreatedAtColumn: string;
  coreMode: SchemaMode;
  applicationBackPhotoColumn: ApplicationBackPhotoColumn;
  applicationAssignedCarColumn: string | null;
  applicationApprovedBondColumn: string;
  applicationBondNotesColumn: string;
  applicationBondPaymentMethodColumn: string;
  applicationBondPaymentStatusColumn: string;
  applicationApprovedWeeklyPriceColumn: string;
  applicationLicenceStateColumn: string;
  applicationPaidAtColumn: string;
  applicationPaymentLinkSentAtColumn: string;
  applicationPaymentLinkVersionColumn: string;
  applicationPendingCheckoutSessionColumn: string;
  applicationCancelReasonColumn: string;
  applicationCancelledAtColumn: string;
  applicationPassportDocumentColumn: ApplicationPassportDocumentColumn;
  rentalStripeSubscriptionColumn: string | null;
  rentalStripeCustomerColumn: string | null;
};

const DEFAULT_SCHEMA_COMPAT: SchemaCompat = {
  applicationApprovedAtColumn: 'approved_at',
  applicationApprovedVehicleColumn: 'approved_vehicle',
  applicationIntendedStartDateColumn: 'intended_start_date',
  applicationAgreementAcceptedAtColumn: 'agreement_accepted_at',
  applicationAgreementSignatureColumn: 'agreement_signature',
  applicationAgreementTemplateVersionColumn: 'agreement_template_version',
  carArchivedAtColumn: 'archived_at',
  carCreatedAtColumn: 'created_at',
  coreMode: 'snake',
  // Default to the modern column name so environments without schema
  // introspection (e.g. missing SUPABASE_SERVICE_ROLE_KEY) still write to
  // the correct column defined in supabase/migrations/01_schema.sql.
  applicationBackPhotoColumn: 'license_back_photo',
  applicationAssignedCarColumn: null,
  applicationApprovedBondColumn: 'approved_bond',
  applicationBondNotesColumn: 'bond_notes',
  applicationBondPaymentMethodColumn: 'bond_payment_method',
  applicationBondPaymentStatusColumn: 'bond_payment_status',
  applicationApprovedWeeklyPriceColumn: 'approved_weekly_price',
  applicationLicenceStateColumn: 'licence_state',
  applicationPaidAtColumn: 'paid_at',
  applicationPaymentLinkSentAtColumn: 'payment_link_sent_at',
  applicationPaymentLinkVersionColumn: 'payment_link_version',
  applicationPendingCheckoutSessionColumn: 'pending_checkout_session_id',
  applicationCancelReasonColumn: 'cancel_reason',
  applicationCancelledAtColumn: 'cancelled_at',
  applicationPassportDocumentColumn: 'passport_or_uber_profile_screenshot',
  rentalStripeSubscriptionColumn: 'stripe_subscription_id',
  rentalStripeCustomerColumn: 'stripe_customer_id',
};

let schemaCompatPromise: Promise<SchemaCompat> | null = null;
let schemaCompatResolvedAt = 0;

const SCHEMA_COMPAT_CACHE_TTL_MS = 60 * 1000;

const hasProperty = (definition: OpenApiDefinition | undefined, key: string) =>
  Boolean(definition?.properties && Object.prototype.hasOwnProperty.call(definition.properties, key));

const fetchOpenApiDefinitions = async (): Promise<Record<string, OpenApiDefinition> | null> => {
  if (
    process.env.VITEST === 'true' ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  const response = await fetch(new URL('/rest/v1/', process.env.SUPABASE_URL), {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/openapi+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to inspect Supabase schema: ${response.status} ${response.statusText}`);
  }

  const spec = (await response.json()) as { definitions?: Record<string, OpenApiDefinition> };
  return spec.definitions || null;
};

export const getSchemaCompat = async (): Promise<SchemaCompat> => {
  const now = Date.now();

  if (schemaCompatPromise && now - schemaCompatResolvedAt > SCHEMA_COMPAT_CACHE_TTL_MS) {
    schemaCompatPromise = null;
  }

  if (!schemaCompatPromise) {
    schemaCompatPromise = (async () => {
      try {
        const definitions = await fetchOpenApiDefinitions();
        if (!definitions) {
          schemaCompatResolvedAt = Date.now();
          return DEFAULT_SCHEMA_COMPAT;
        }

        const carsDefinition = definitions.cars;
        const applicationsDefinition = definitions.applications;
        const rentalsDefinition = definitions.rentals;

        const coreMode: SchemaMode = hasProperty(carsDefinition, 'modelYear') ? 'camel' : 'snake';
        const carArchivedAtColumn = hasProperty(carsDefinition, 'archivedAt')
          ? 'archivedAt'
          : hasProperty(carsDefinition, 'archived_at')
            ? 'archived_at'
            : coreMode === 'camel'
              ? 'archivedAt'
              : 'archived_at';
        const carCreatedAtColumn = hasProperty(carsDefinition, 'createdAt')
          ? 'createdAt'
          : 'created_at';
        const applicationBackPhotoColumn: ApplicationBackPhotoColumn = hasProperty(
          applicationsDefinition,
          'licenseBackPhoto'
        )
          ? 'licenseBackPhoto'
          : hasProperty(applicationsDefinition, 'license_back_photo')
            ? 'license_back_photo'
            : hasProperty(applicationsDefinition, 'uberScreenshot')
              ? 'uberScreenshot'
              : hasProperty(applicationsDefinition, 'uber_screenshot')
                ? 'uber_screenshot'
                : coreMode === 'camel'
              ? 'uberScreenshot'
              : 'uber_screenshot';
        const applicationPassportDocumentColumn: ApplicationPassportDocumentColumn = hasProperty(
          applicationsDefinition,
          'passportOrUberProfileScreenshot'
        )
          ? 'passportOrUberProfileScreenshot'
          : hasProperty(applicationsDefinition, 'passport_or_uber_profile_screenshot')
            ? 'passport_or_uber_profile_screenshot'
            : coreMode === 'camel'
              ? 'passportOrUberProfileScreenshot'
              : 'passport_or_uber_profile_screenshot';
        const applicationLicenceStateColumn = hasProperty(applicationsDefinition, 'licenceState')
          ? 'licenceState'
          : hasProperty(applicationsDefinition, 'licence_state')
            ? 'licence_state'
            : coreMode === 'camel'
              ? 'licenceState'
              : 'licence_state';
        const applicationAssignedCarColumn = hasProperty(applicationsDefinition, 'assignedCarId')
          ? 'assignedCarId'
          : hasProperty(applicationsDefinition, 'assigned_car_id')
            ? 'assigned_car_id'
            : null;
        const applicationApprovedBondColumn = hasProperty(applicationsDefinition, 'approvedBond')
          ? 'approvedBond'
          : hasProperty(applicationsDefinition, 'approved_bond')
            ? 'approved_bond'
            : coreMode === 'camel'
              ? 'approvedBond'
              : 'approved_bond';
        const applicationApprovedWeeklyPriceColumn = hasProperty(
          applicationsDefinition,
          'approvedWeeklyPrice'
        )
          ? 'approvedWeeklyPrice'
          : hasProperty(applicationsDefinition, 'approved_weekly_price')
            ? 'approved_weekly_price'
            : coreMode === 'camel'
              ? 'approvedWeeklyPrice'
              : 'approved_weekly_price';
        const applicationBondPaymentStatusColumn = hasProperty(
          applicationsDefinition,
          'bondPaymentStatus'
        )
          ? 'bondPaymentStatus'
          : hasProperty(applicationsDefinition, 'bond_payment_status')
            ? 'bond_payment_status'
            : coreMode === 'camel'
              ? 'bondPaymentStatus'
              : 'bond_payment_status';
        const applicationBondPaymentMethodColumn = hasProperty(
          applicationsDefinition,
          'bondPaymentMethod'
        )
          ? 'bondPaymentMethod'
          : hasProperty(applicationsDefinition, 'bond_payment_method')
            ? 'bond_payment_method'
            : coreMode === 'camel'
              ? 'bondPaymentMethod'
              : 'bond_payment_method';
        const applicationBondNotesColumn = hasProperty(
          applicationsDefinition,
          'bondNotes'
        )
          ? 'bondNotes'
          : hasProperty(applicationsDefinition, 'bond_notes')
            ? 'bond_notes'
            : coreMode === 'camel'
              ? 'bondNotes'
              : 'bond_notes';
        const applicationApprovedVehicleColumn = hasProperty(
          applicationsDefinition,
          'approvedVehicle'
        )
          ? 'approvedVehicle'
          : hasProperty(applicationsDefinition, 'approved_vehicle')
            ? 'approved_vehicle'
            : coreMode === 'camel'
              ? 'approvedVehicle'
              : 'approved_vehicle';
        const applicationPaymentLinkVersionColumn = hasProperty(
          applicationsDefinition,
          'paymentLinkVersion'
        )
          ? 'paymentLinkVersion'
          : hasProperty(applicationsDefinition, 'payment_link_version')
            ? 'payment_link_version'
            : coreMode === 'camel'
              ? 'paymentLinkVersion'
              : 'payment_link_version';
        const applicationPaymentLinkSentAtColumn = hasProperty(
          applicationsDefinition,
          'paymentLinkSentAt'
        )
          ? 'paymentLinkSentAt'
          : hasProperty(applicationsDefinition, 'payment_link_sent_at')
            ? 'payment_link_sent_at'
            : coreMode === 'camel'
              ? 'paymentLinkSentAt'
              : 'payment_link_sent_at';
        const applicationApprovedAtColumn = hasProperty(applicationsDefinition, 'approvedAt')
          ? 'approvedAt'
          : hasProperty(applicationsDefinition, 'approved_at')
            ? 'approved_at'
            : coreMode === 'camel'
              ? 'approvedAt'
              : 'approved_at';
        const applicationIntendedStartDateColumn = hasProperty(applicationsDefinition, 'intendedStartDate')
          ? 'intendedStartDate'
          : hasProperty(applicationsDefinition, 'intended_start_date')
            ? 'intended_start_date'
            : coreMode === 'camel'
              ? 'intendedStartDate'
              : 'intended_start_date';
        const applicationAgreementAcceptedAtColumn = hasProperty(
          applicationsDefinition,
          'agreementAcceptedAt'
        )
          ? 'agreementAcceptedAt'
          : hasProperty(applicationsDefinition, 'agreement_accepted_at')
            ? 'agreement_accepted_at'
            : coreMode === 'camel'
              ? 'agreementAcceptedAt'
              : 'agreement_accepted_at';
        const applicationAgreementSignatureColumn = hasProperty(
          applicationsDefinition,
          'agreementSignature'
        )
          ? 'agreementSignature'
          : hasProperty(applicationsDefinition, 'agreement_signature')
            ? 'agreement_signature'
            : coreMode === 'camel'
              ? 'agreementSignature'
              : 'agreement_signature';
        const applicationAgreementTemplateVersionColumn: ApplicationAgreementTemplateVersionColumn = hasProperty(
          applicationsDefinition,
          'agreementTemplateVersion'
        )
          ? 'agreementTemplateVersion'
          : hasProperty(applicationsDefinition, 'agreement_template_version')
            ? 'agreement_template_version'
            : coreMode === 'camel'
              ? 'agreementTemplateVersion'
              : 'agreement_template_version';
        const applicationPaidAtColumn = hasProperty(applicationsDefinition, 'paidAt')
          ? 'paidAt'
          : hasProperty(applicationsDefinition, 'paid_at')
            ? 'paid_at'
            : coreMode === 'camel'
              ? 'paidAt'
              : 'paid_at';
        const applicationPendingCheckoutSessionColumn = hasProperty(
          applicationsDefinition,
          'pendingCheckoutSessionId'
        )
          ? 'pendingCheckoutSessionId'
            : hasProperty(applicationsDefinition, 'pending_checkout_session_id')
            ? 'pending_checkout_session_id'
            : coreMode === 'camel'
              ? 'pendingCheckoutSessionId'
              : 'pending_checkout_session_id';
        const applicationCancelledAtColumn = hasProperty(applicationsDefinition, 'cancelledAt')
          ? 'cancelledAt'
          : hasProperty(applicationsDefinition, 'cancelled_at')
            ? 'cancelled_at'
            : coreMode === 'camel'
              ? 'cancelledAt'
              : 'cancelled_at';
        const applicationCancelReasonColumn = hasProperty(applicationsDefinition, 'cancelReason')
          ? 'cancelReason'
          : hasProperty(applicationsDefinition, 'cancel_reason')
            ? 'cancel_reason'
            : coreMode === 'camel'
              ? 'cancelReason'
              : 'cancel_reason';
        const rentalStripeSubscriptionColumn = hasProperty(rentalsDefinition, 'stripeSubscriptionId')
          ? 'stripeSubscriptionId'
          : hasProperty(rentalsDefinition, 'stripe_subscription_id')
            ? 'stripe_subscription_id'
            : null;
        const rentalStripeCustomerColumn = hasProperty(rentalsDefinition, 'stripeCustomerId')
          ? 'stripeCustomerId'
          : hasProperty(rentalsDefinition, 'stripe_customer_id')
            ? 'stripe_customer_id'
            : null;

        const resolvedCompat = {
          applicationApprovedAtColumn,
          applicationApprovedVehicleColumn,
          applicationIntendedStartDateColumn,
          applicationAgreementAcceptedAtColumn,
          applicationAgreementSignatureColumn,
          applicationAgreementTemplateVersionColumn,
          carArchivedAtColumn,
          carCreatedAtColumn,
          coreMode,
          applicationBackPhotoColumn,
          applicationAssignedCarColumn,
          applicationApprovedBondColumn,
          applicationBondNotesColumn,
          applicationBondPaymentMethodColumn,
          applicationBondPaymentStatusColumn,
          applicationApprovedWeeklyPriceColumn,
          applicationLicenceStateColumn,
          applicationPaidAtColumn,
          applicationPaymentLinkSentAtColumn,
          applicationPaymentLinkVersionColumn,
          applicationPendingCheckoutSessionColumn,
          applicationCancelReasonColumn,
          applicationCancelledAtColumn,
          applicationPassportDocumentColumn,
          rentalStripeSubscriptionColumn,
          rentalStripeCustomerColumn,
        };

        schemaCompatResolvedAt = Date.now();
        return resolvedCompat;
      } catch (error) {
        console.warn('Falling back to default schema compatibility mode:', error);
        schemaCompatResolvedAt = Date.now();
        return DEFAULT_SCHEMA_COMPAT;
      }
    })().catch((error) => {
      schemaCompatPromise = null;
      throw error;
    });
  }

  return schemaCompatPromise;
};

export const getCarSelectColumns = async () => {
  const { carArchivedAtColumn, carCreatedAtColumn, coreMode } = await getSchemaCompat();

  if (coreMode !== 'camel') {
    const archivedAtSelect =
      carArchivedAtColumn === 'archived_at' ? 'archived_at' : `archived_at:${carArchivedAtColumn}`;
    return ['id', 'name', 'model_year', 'weekly_price', 'bond', 'status', 'image', archivedAtSelect, 'created_at'].join(', ');
  }

  const archivedAtSelect =
    carArchivedAtColumn === 'archivedAt' ? 'archived_at:archivedAt' : `archived_at:${carArchivedAtColumn}`;

  return carCreatedAtColumn === 'createdAt'
    ? ['id', 'name', 'model_year:modelYear', 'weekly_price:weeklyPrice', 'bond', 'status', 'image', archivedAtSelect, 'created_at:createdAt'].join(', ')
    : ['id', 'name', 'model_year:modelYear', 'weekly_price:weeklyPrice', 'bond', 'status', 'image', archivedAtSelect, 'created_at'].join(', ');
};

export const toCarWritePayload = async (car: {
  name: string;
  model_year: number;
  weekly_price: number;
  bond: number;
  status: string;
  image: string;
}) => {
  const { coreMode } = await getSchemaCompat();
  const normalizedBond =
    Number.isFinite(car.bond) && car.bond >= 0
      ? car.bond
      : calculateBondFromWeeklyRent(car.weekly_price);

  return coreMode === 'camel'
    ? {
        name: car.name,
        modelYear: car.model_year,
        weeklyPrice: car.weekly_price,
        bond: normalizedBond,
        status: car.status,
        image: car.image,
      }
    : {
        name: car.name,
        model_year: car.model_year,
        weekly_price: car.weekly_price,
        bond: normalizedBond,
        status: car.status,
        image: car.image,
      };
};

export const getCarWeeklyPriceColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'weeklyPrice' : 'weekly_price';
};

export const getCarCreatedAtColumn = async () => {
  const { carCreatedAtColumn } = await getSchemaCompat();
  return carCreatedAtColumn;
};

export const getCarArchivedAtColumn = async () => {
  const { carArchivedAtColumn } = await getSchemaCompat();
  return carArchivedAtColumn;
};

export const getApplicationSelectColumns = async () => {
  const {
    coreMode,
    applicationBackPhotoColumn,
    applicationPassportDocumentColumn,
    applicationAssignedCarColumn,
    applicationApprovedBondColumn,
    applicationBondNotesColumn,
    applicationBondPaymentMethodColumn,
    applicationBondPaymentStatusColumn,
    applicationApprovedVehicleColumn,
    applicationAgreementAcceptedAtColumn,
    applicationAgreementSignatureColumn,
    applicationAgreementTemplateVersionColumn,
    applicationApprovedWeeklyPriceColumn,
    applicationPaymentLinkVersionColumn,
    applicationPaymentLinkSentAtColumn,
    applicationApprovedAtColumn,
    applicationPaidAtColumn,
    applicationPendingCheckoutSessionColumn,
    applicationCancelledAtColumn,
    applicationCancelReasonColumn,
  } = await getSchemaCompat();
  const backPhotoSelect =
    applicationBackPhotoColumn === 'license_back_photo'
      ? 'license_back_photo'
      : `license_back_photo:${applicationBackPhotoColumn}`;
  const passportDocumentSelect =
    applicationPassportDocumentColumn === 'passport_or_uber_profile_screenshot'
      ? 'passport_or_uber_profile_screenshot'
      : `passport_or_uber_profile_screenshot:${applicationPassportDocumentColumn}`;
  const assignedCarSelect = applicationAssignedCarColumn
    ? applicationAssignedCarColumn === 'assigned_car_id'
      ? 'assigned_car_id'
      : `assigned_car_id:${applicationAssignedCarColumn}`
    : null;
  const approvedBondSelect =
    applicationApprovedBondColumn === 'approved_bond'
      ? 'approved_bond'
      : `approved_bond:${applicationApprovedBondColumn}`;
  const bondPaymentStatusSelect =
    applicationBondPaymentStatusColumn === 'bond_payment_status'
      ? 'bond_payment_status'
      : `bond_payment_status:${applicationBondPaymentStatusColumn}`;
  const bondPaymentMethodSelect =
    applicationBondPaymentMethodColumn === 'bond_payment_method'
      ? 'bond_payment_method'
      : `bond_payment_method:${applicationBondPaymentMethodColumn}`;
  const bondNotesSelect =
    applicationBondNotesColumn === 'bond_notes'
      ? 'bond_notes'
      : `bond_notes:${applicationBondNotesColumn}`;
  const approvedVehicleSelect =
    applicationApprovedVehicleColumn === 'approved_vehicle'
      ? 'approved_vehicle'
      : `approved_vehicle:${applicationApprovedVehicleColumn}`;
  const approvedWeeklyPriceSelect =
    applicationApprovedWeeklyPriceColumn === 'approved_weekly_price'
      ? 'approved_weekly_price'
      : `approved_weekly_price:${applicationApprovedWeeklyPriceColumn}`;
  const paymentLinkVersionSelect =
    applicationPaymentLinkVersionColumn === 'payment_link_version'
      ? 'payment_link_version'
      : `payment_link_version:${applicationPaymentLinkVersionColumn}`;
  const paymentLinkSentAtSelect =
    applicationPaymentLinkSentAtColumn === 'payment_link_sent_at'
      ? 'payment_link_sent_at'
      : `payment_link_sent_at:${applicationPaymentLinkSentAtColumn}`;
  const approvedAtSelect =
    applicationApprovedAtColumn === 'approved_at'
      ? 'approved_at'
      : `approved_at:${applicationApprovedAtColumn}`;
  const agreementAcceptedAtSelect =
    applicationAgreementAcceptedAtColumn === 'agreement_accepted_at'
      ? 'agreement_accepted_at'
      : `agreement_accepted_at:${applicationAgreementAcceptedAtColumn}`;
  const agreementSignatureSelect =
    applicationAgreementSignatureColumn === 'agreement_signature'
      ? 'agreement_signature'
      : `agreement_signature:${applicationAgreementSignatureColumn}`;
  const agreementTemplateVersionSelect =
    applicationAgreementTemplateVersionColumn === 'agreement_template_version'
      ? 'agreement_template_version'
      : `agreement_template_version:${applicationAgreementTemplateVersionColumn}`;
  const paidAtSelect =
    applicationPaidAtColumn === 'paid_at'
      ? 'paid_at'
      : `paid_at:${applicationPaidAtColumn}`;
  const pendingCheckoutSessionSelect =
    applicationPendingCheckoutSessionColumn === 'pending_checkout_session_id'
      ? 'pending_checkout_session_id'
      : `pending_checkout_session_id:${applicationPendingCheckoutSessionColumn}`;
  const cancelledAtSelect =
    applicationCancelledAtColumn === 'cancelled_at'
      ? 'cancelled_at'
      : `cancelled_at:${applicationCancelledAtColumn}`;
  const cancelReasonSelect =
    applicationCancelReasonColumn === 'cancel_reason'
      ? 'cancel_reason'
      : `cancel_reason:${applicationCancelReasonColumn}`;

  return coreMode === 'camel'
    ? [
        'id',
        'name',
        'phone',
        'email',
        'license_number:licenseNumber',
        'license_expiry:licenseExpiry',
        'uber_status:uberStatus',
        'experience',
        'address',
        'weekly_budget:weeklyBudget',
        'intended_start_date:intendedStartDate',
        'license_photo:licensePhoto',
        backPhotoSelect,
        passportDocumentSelect,
        ...(assignedCarSelect ? [assignedCarSelect] : []),
        approvedBondSelect,
        bondPaymentStatusSelect,
        bondPaymentMethodSelect,
        bondNotesSelect,
        approvedVehicleSelect,
        approvedWeeklyPriceSelect,
        paymentLinkVersionSelect,
        paymentLinkSentAtSelect,
        approvedAtSelect,
        agreementAcceptedAtSelect,
        agreementSignatureSelect,
        agreementTemplateVersionSelect,
        paidAtSelect,
        pendingCheckoutSessionSelect,
        cancelledAtSelect,
        cancelReasonSelect,
        'status',
        'created_at:createdAt',
      ].join(', ')
    : [
        'id',
        'name',
        'phone',
        'email',
        'license_number',
        'license_expiry',
        'uber_status',
        'experience',
        'address',
        'weekly_budget',
        'intended_start_date',
        'license_photo',
        backPhotoSelect,
        passportDocumentSelect,
        ...(assignedCarSelect ? [assignedCarSelect] : []),
        approvedBondSelect,
        bondPaymentStatusSelect,
        bondPaymentMethodSelect,
        bondNotesSelect,
        approvedVehicleSelect,
        approvedWeeklyPriceSelect,
        paymentLinkVersionSelect,
        paymentLinkSentAtSelect,
        approvedAtSelect,
        agreementAcceptedAtSelect,
        agreementSignatureSelect,
        agreementTemplateVersionSelect,
        paidAtSelect,
        pendingCheckoutSessionSelect,
        cancelledAtSelect,
        cancelReasonSelect,
        'status',
        'created_at',
      ].join(', ');
};

export const getApplicationDuplicateCheckColumns = async () => {
  const { coreMode } = await getSchemaCompat();

  return coreMode === 'camel'
    ? ['id', 'phone', 'email', 'license_number:licenseNumber', 'status'].join(', ')
    : ['id', 'phone', 'email', 'license_number', 'status'].join(', ');
};

export const toApplicationWritePayload = async (application: {
  name: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry: string;
  uber_status: string;
  experience: string;
  address: string;
  weekly_budget?: string | null;
  intended_start_date: string;
  license_photo?: string | null;
  license_back_photo?: string | null;
  passport_or_uber_profile_screenshot?: string | null;
  agreement_accepted_at?: string | null;
  agreement_signature?: string | null;
  agreement_template_version?: number | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  status?: string;
}) => {
  const {
    coreMode,
    applicationBackPhotoColumn,
    applicationPassportDocumentColumn,
    applicationAgreementAcceptedAtColumn,
    applicationAgreementSignatureColumn,
    applicationAgreementTemplateVersionColumn,
    applicationCancelledAtColumn,
    applicationCancelReasonColumn,
  } = await getSchemaCompat();

  const statusPayload = application.status ? { status: application.status } : {};
  const licenseBackPhoto = application.license_back_photo ?? null;
  const passportDocument = application.passport_or_uber_profile_screenshot ?? null;

  if (coreMode === 'camel') {
    const payload: Record<string, unknown> = {
      name: application.name,
      phone: application.phone,
      email: application.email,
      licenseNumber: application.license_number,
      licenseExpiry: application.license_expiry,
      uberStatus: application.uber_status,
      experience: application.experience,
      address: application.address,
      weeklyBudget: application.weekly_budget ?? null,
      intendedStartDate: application.intended_start_date,
      licensePhoto: application.license_photo ?? null,
      agreementAcceptedAt: application.agreement_accepted_at ?? null,
      agreementSignature: application.agreement_signature ?? null,
      agreementTemplateVersion: application.agreement_template_version ?? null,
      cancelledAt: application.cancelled_at ?? null,
      cancelReason: application.cancel_reason ?? null,
      ...statusPayload,
    };
    payload[applicationBackPhotoColumn] = licenseBackPhoto;
    payload[applicationPassportDocumentColumn] = passportDocument;
    payload[applicationAgreementAcceptedAtColumn] = application.agreement_accepted_at ?? null;
    payload[applicationAgreementSignatureColumn] = application.agreement_signature ?? null;
    payload[applicationAgreementTemplateVersionColumn] =
      application.agreement_template_version ?? null;
    payload[applicationCancelledAtColumn] = application.cancelled_at ?? null;
    payload[applicationCancelReasonColumn] = application.cancel_reason ?? null;
    return payload;
  }

  const payload: Record<string, unknown> = {
    name: application.name,
    phone: application.phone,
    email: application.email,
    license_number: application.license_number,
    license_expiry: application.license_expiry,
    uber_status: application.uber_status,
    experience: application.experience,
    address: application.address,
    weekly_budget: application.weekly_budget ?? null,
    intended_start_date: application.intended_start_date,
    license_photo: application.license_photo ?? null,
    agreement_accepted_at: application.agreement_accepted_at ?? null,
    agreement_signature: application.agreement_signature ?? null,
    agreement_template_version: application.agreement_template_version ?? null,
    cancelled_at: application.cancelled_at ?? null,
    cancel_reason: application.cancel_reason ?? null,
    ...statusPayload,
  };
  payload[applicationBackPhotoColumn] = licenseBackPhoto;
  payload[applicationPassportDocumentColumn] = passportDocument;
  payload[applicationAgreementAcceptedAtColumn] = application.agreement_accepted_at ?? null;
  payload[applicationAgreementSignatureColumn] = application.agreement_signature ?? null;
  payload[applicationAgreementTemplateVersionColumn] =
    application.agreement_template_version ?? null;
  payload[applicationCancelledAtColumn] = application.cancelled_at ?? null;
  payload[applicationCancelReasonColumn] = application.cancel_reason ?? null;
  return payload;
};

export const getApplicationCreatedAtColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'createdAt' : 'created_at';
};

export const getApplicationAssignedCarColumn = async () => {
  const { applicationAssignedCarColumn } = await getSchemaCompat();
  return applicationAssignedCarColumn;
};

export const toApplicationPaymentWritePayload = async (payload: {
  assigned_car_id?: number | null;
  approved_bond?: number | null;
  bond_notes?: string | null;
  bond_payment_method?: string | null;
  bond_payment_status?: string | null;
  approved_vehicle?: string | null;
  approved_weekly_price?: number | null;
  intended_start_date?: string | null;
  payment_link_version?: number;
  payment_link_sent_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  pending_checkout_session_id?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  status?: string;
}) => {
  const compat = await getSchemaCompat();
  const mappedPayload: Record<string, unknown> = {};

  if ('assigned_car_id' in payload && compat.applicationAssignedCarColumn) {
    mappedPayload[compat.applicationAssignedCarColumn] = payload.assigned_car_id ?? null;
  }

  if ('approved_bond' in payload) {
    mappedPayload[compat.applicationApprovedBondColumn] = payload.approved_bond ?? null;
  }

  if ('bond_payment_status' in payload) {
    mappedPayload[compat.applicationBondPaymentStatusColumn] =
      payload.bond_payment_status ?? null;
  }

  if ('bond_payment_method' in payload) {
    mappedPayload[compat.applicationBondPaymentMethodColumn] =
      payload.bond_payment_method ?? null;
  }

  if ('bond_notes' in payload) {
    mappedPayload[compat.applicationBondNotesColumn] = payload.bond_notes ?? null;
  }

  if ('approved_vehicle' in payload) {
    mappedPayload[compat.applicationApprovedVehicleColumn] = payload.approved_vehicle ?? null;
  }

  if ('approved_weekly_price' in payload) {
    mappedPayload[compat.applicationApprovedWeeklyPriceColumn] =
      payload.approved_weekly_price ?? null;
  }

  if ('intended_start_date' in payload) {
    mappedPayload[compat.applicationIntendedStartDateColumn] =
      payload.intended_start_date ?? null;
  }

  if ('payment_link_version' in payload) {
    mappedPayload[compat.applicationPaymentLinkVersionColumn] =
      payload.payment_link_version ?? 0;
  }

  if ('payment_link_sent_at' in payload) {
    mappedPayload[compat.applicationPaymentLinkSentAtColumn] =
      payload.payment_link_sent_at ?? null;
  }

  if ('approved_at' in payload) {
    mappedPayload[compat.applicationApprovedAtColumn] = payload.approved_at ?? null;
  }

  if ('paid_at' in payload) {
    mappedPayload[compat.applicationPaidAtColumn] = payload.paid_at ?? null;
  }

  if ('pending_checkout_session_id' in payload) {
    mappedPayload[compat.applicationPendingCheckoutSessionColumn] =
      payload.pending_checkout_session_id ?? null;
  }

  if ('cancelled_at' in payload) {
    mappedPayload[compat.applicationCancelledAtColumn] = payload.cancelled_at ?? null;
  }

  if ('cancel_reason' in payload) {
    mappedPayload[compat.applicationCancelReasonColumn] = payload.cancel_reason ?? null;
  }

  if (payload.status) {
    mappedPayload.status = payload.status;
  }

  return mappedPayload;
};

export const getApplicationDocumentColumn = async (
  column:
    | 'license_photo'
    | 'license_back_photo'
    | 'passport_or_uber_profile_screenshot'
) => {
  const {
    coreMode,
    applicationBackPhotoColumn,
    applicationPassportDocumentColumn,
  } = await getSchemaCompat();

  if (column === 'license_back_photo') {
    return applicationBackPhotoColumn;
  }

  if (column === 'passport_or_uber_profile_screenshot') {
    return applicationPassportDocumentColumn;
  }

  return coreMode === 'camel' ? 'licensePhoto' : 'license_photo';
};

export const getRentalSelectColumns = async ({
  includeRelations = false,
  includeStripeFields = false,
}: {
  includeRelations?: boolean;
  includeStripeFields?: boolean;
} = {}) => {
  const compat = await getSchemaCompat();
  const columns =
    compat.coreMode === 'camel'
      ? [
          'id',
          'car_id:carId',
          'application_id:applicationId',
          'start_date:startDate',
          'end_date:endDate',
          'weekly_price:weeklyPrice',
          'bond_paid:bondPaid',
          'status',
          'created_at:createdAt',
        ]
      : [
          'id',
          'car_id',
          'application_id',
          'start_date',
          'end_date',
          'weekly_price',
          'bond_paid',
          'status',
          'created_at',
        ];

  if (includeStripeFields && compat.rentalStripeSubscriptionColumn) {
    columns.push(
      compat.rentalStripeSubscriptionColumn === 'stripeSubscriptionId'
        ? 'stripe_subscription_id:stripeSubscriptionId'
        : 'stripe_subscription_id'
    );
  }

  if (includeStripeFields && compat.rentalStripeCustomerColumn) {
    columns.push(
      compat.rentalStripeCustomerColumn === 'stripeCustomerId'
        ? 'stripe_customer_id:stripeCustomerId'
        : 'stripe_customer_id'
    );
  }

  if (includeRelations) {
    columns.push(
      compat.coreMode === 'camel'
        ? 'applications:applicationId(name), cars:carId(name)'
        : 'applications:application_id(name), cars:car_id(name)'
    );
  }

  return columns.join(', ');
};

export const toRentalWritePayload = async (rental: {
  car_id: number;
  application_id: string;
  start_date: string;
  end_date?: string | null;
  weekly_price: number;
  bond_paid?: number | null;
  status: string;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}) => {
  const compat = await getSchemaCompat();
  const basePayload =
    compat.coreMode === 'camel'
      ? {
          carId: rental.car_id,
          applicationId: rental.application_id,
          startDate: rental.start_date,
          endDate: rental.end_date ?? null,
          weeklyPrice: rental.weekly_price,
          bondPaid: rental.bond_paid ?? 0,
          status: rental.status,
        }
      : {
          car_id: rental.car_id,
          application_id: rental.application_id,
          start_date: rental.start_date,
          end_date: rental.end_date ?? null,
          weekly_price: rental.weekly_price,
          bond_paid: rental.bond_paid ?? 0,
          status: rental.status,
        };

  if (compat.rentalStripeSubscriptionColumn && rental.stripe_subscription_id) {
    (basePayload as Record<string, unknown>)[compat.rentalStripeSubscriptionColumn] =
      rental.stripe_subscription_id;
  }

  if (compat.rentalStripeCustomerColumn && rental.stripe_customer_id) {
    (basePayload as Record<string, unknown>)[compat.rentalStripeCustomerColumn] =
      rental.stripe_customer_id;
  }

  return basePayload;
};

export const getRentalCreatedAtColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'createdAt' : 'created_at';
};

export const getRentalCarIdColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'carId' : 'car_id';
};

export const getRentalApplicationIdColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'applicationId' : 'application_id';
};

export const getBookingCarIdColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'carId' : 'car_id';
};

export const getLeaseAgreementCarIdColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'carId' : 'car_id';
};

export const getBookingSelectColumns = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel'
    ? 'id, total_amount:totalAmount'
    : 'id, total_amount';
};
