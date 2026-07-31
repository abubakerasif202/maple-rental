import axios from 'axios';
import { z } from 'zod';
import {
  Application,
  Rental,
  DashboardStats,
  DashboardSummaryResponse,
  AdminDatasetResponse,
  OperationalCustomer,
  OperationalInvoice,
  ManualInvoice,
  ManualInvoiceItem,
  ManualInvoiceStatus,
} from '../types';
import type { PublicRentalPlan } from './rentalPlans';
import type { InquiryValues } from '../../shared/inquiry';
import type { CheckoutSessionStatusState } from './checkoutSessionStatus';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true, // Necessary for HTTP-only cookies
});

// Global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const isAdminScreen = currentPath.startsWith('/admin');

    if (error.response?.status === 401 && isAdminScreen && !currentPath.includes('/admin/login')) {
      window.location.replace('/admin/login');
    }
    // 403 = wrong account, not unauthenticated — don't redirect silently.
    // Let the calling code handle it and show a user-facing message.
    return Promise.reject(error);
  }
);

export const logoutAdmin = async (): Promise<{ message: string }> => {
  const { data } = await api.post('/auth/logout');
  return data;
};

export interface AdminSessionResponse {
  user: {
    username: string;
  };
}

export const verifyAdminSession = async (): Promise<AdminSessionResponse> => {
  const { data } = await api.get('/auth/verify');
  return data;
};

export const fetchApplications = async (
  params: AdminDatasetRequest & { statuses?: string[] } = {},
  signal?: AbortSignal
): Promise<AdminDatasetResponse<Application>> => {
  const queryParams: Record<string, string | number> = {};
  if (params.page != null) queryParams.page = params.page;
  if (params.pageSize != null) queryParams.pageSize = params.pageSize;
  if (params.search != null) queryParams.search = params.search;
  if (params.statuses && params.statuses.length > 0) queryParams.statuses = params.statuses.join(',');
  const { data } = await api.get('/applications', { params: queryParams, signal });
  return data;
};

export interface ApplicationAgreementTemplateResponse {
  agreement: string;
  agreementTemplateVersion: number;
}

export const updateApplicationStatus = async (id: string, status: string): Promise<{ success: boolean }> => {
  const { data } = await api.put(`/applications/${id}/status`, { status });
  return data;
};

export const fetchStats = async (): Promise<DashboardStats> => {
  const { data } = await api.get('/financials/stats');
  return data;
};

export const fetchDashboardSummary = async (
  signal?: AbortSignal
): Promise<DashboardSummaryResponse> => {
  const { data } = await api.get('/financials/dashboard-summary', { signal });
  return data;
};

export const fetchRentals = async (
  params: AdminDatasetRequest = {},
  signal?: AbortSignal
): Promise<AdminDatasetResponse<Rental>> => {
  const { data } = await api.get('/rentals', { params, signal });
  return data;
};

export interface CancelSubscriptionResponse {
  success: boolean;
  rentalId: string;
  operationId: string;
  cancelAtPeriodEnd: boolean;
  stripeStatus: string;
  message?: string;
}

export const cancelRentalStripeSubscription = async (
  rentalId: number,
  payload: {
    cancelAtPeriodEnd: boolean;
    confirm: 'CANCEL SUBSCRIPTION';
    reason?: string;
  }
): Promise<CancelSubscriptionResponse> => {
  const { data } = await api.post(
    `/admin/rentals/${rentalId}/cancel-subscription`,
    payload
  );
  return data;
};

export interface AdminDatasetRequest {
  page?: number;
  pageSize?: number;
  search?: string;
}

export type FleetImportStatus =
  | 'uploaded' | 'parsing' | 'needs_review' | 'ready' | 'applying'
  | 'partially_applied' | 'applied' | 'failed' | 'cancelled';

export interface FleetImportSummary {
  id: string;
  original_filename: string;
  snapshot_date: string;
  status: FleetImportStatus;
  total_rows: number;
  valid_rows: number;
  review_rows: number;
  applied_rows: number;
  rejected_rows: number;
  uploaded_by: string;
  created_at: string;
  total_weekly_rate?: number | string;
  matched_rows?: number;
  unmatched_rows?: number;
  proposed_increases?: number;
  proposed_decreases?: number;
}

export interface FleetImportRow {
  id: string;
  source_row_number: number;
  driver_name_original: string | null;
  vehicle_registration_original: string;
  make_original: string;
  model_original: string;
  weekly_rate: number | string;
  snapshot_date: string;
  source_notes: string | null;
  validation_status: 'ready' | 'needs_review';
  validation_errors: string[];
  validation_warnings: string[];
  matched_rental_id: number | null;
  existing_registration: string | null;
  existing_weekly_rate: number | string | null;
  apply_status: 'pending' | 'applied' | 'rejected' | 'conflict';
}

export interface FleetImportAuditEvent {
  id: string | number;
  action: string;
  actor: string | null;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FleetPage<T> { items: T[]; page: number; pageSize: number; total: number }

const fleetImportSummarySchema = z.object({
  id: z.string().uuid(), original_filename: z.string(), snapshot_date: z.string(),
  status: z.enum(['uploaded', 'parsing', 'needs_review', 'ready', 'applying', 'partially_applied', 'applied', 'failed', 'cancelled']),
  total_rows: z.number(), valid_rows: z.number(), review_rows: z.number(), applied_rows: z.number(),
  rejected_rows: z.number(), uploaded_by: z.string(), created_at: z.string(),
  total_weekly_rate: z.union([z.number(), z.string()]).optional(), matched_rows: z.number().optional(),
  unmatched_rows: z.number().optional(), proposed_increases: z.number().optional(), proposed_decreases: z.number().optional(),
}).passthrough();
const fleetImportRowSchema = z.object({
  id: z.string().uuid(), source_row_number: z.number(), driver_name_original: z.string().nullable(),
  vehicle_registration_original: z.string(), make_original: z.string(), model_original: z.string(),
  weekly_rate: z.union([z.number(), z.string()]), snapshot_date: z.string(), source_notes: z.string().nullable(),
  validation_status: z.enum(['ready', 'needs_review']), validation_errors: z.array(z.string()),
  validation_warnings: z.array(z.string()), matched_rental_id: z.number().nullable(),
  existing_registration: z.string().nullable(), existing_weekly_rate: z.union([z.number(), z.string()]).nullable(),
  apply_status: z.enum(['pending', 'applied', 'rejected', 'conflict']),
}).passthrough();
const fleetPageSchema = <T extends z.ZodType>(item: T) => z.object({
  items: z.array(item), page: z.number(), pageSize: z.number(), total: z.number(),
});

export const uploadFleetImport = async (file: File): Promise<FleetImportSummary> => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/admin/fleet-imports', form);
  return fleetImportSummarySchema.parse(data);
};

export const fetchFleetImports = async (params: AdminDatasetRequest, signal?: AbortSignal): Promise<FleetPage<FleetImportSummary>> => {
  const { data } = await api.get('/admin/fleet-imports', { params, signal });
  return fleetPageSchema(fleetImportSummarySchema).parse(data);
};

export const fetchFleetImport = async (id: string, signal?: AbortSignal): Promise<FleetImportSummary> => {
  const { data } = await api.get(`/admin/fleet-imports/${id}`, { signal });
  return fleetImportSummarySchema.parse(data);
};

export const fetchFleetImportRows = async (id: string, params: AdminDatasetRequest & { status?: string }, signal?: AbortSignal): Promise<FleetPage<FleetImportRow>> => {
  const { data } = await api.get(`/admin/fleet-imports/${id}/rows`, { params, signal });
  return fleetPageSchema(fleetImportRowSchema).parse(data);
};

export const updateFleetImportRow = async (importId: string, rowId: string, payload: { acknowledgeWarnings?: boolean; driverName?: string | null; sourceNotes?: string | null; weeklyRate?: number }) => {
  const { data } = await api.patch(`/admin/fleet-imports/${importId}/rows/${rowId}`, payload);
  return fleetImportRowSchema.parse(data);
};

export const matchFleetImportRow = async (importId: string, rowId: string, rentalId: number | null) => {
  const { data } = await api.put(`/admin/fleet-imports/${importId}/rows/${rowId}/match`, { rentalId });
  return fleetImportRowSchema.parse(data);
};

export const revalidateFleetImportRow = async (importId: string, rowId: string) => {
  const { data } = await api.post(`/admin/fleet-imports/${importId}/rows/${rowId}/revalidate`);
  return fleetImportRowSchema.parse(data);
};

export const fetchFleetImportAudit = async (id: string, page: number, signal?: AbortSignal): Promise<FleetPage<FleetImportAuditEvent>> => {
  const { data } = await api.get(`/admin/fleet-imports/${id}/audit`, { params: { page, pageSize: 10 }, signal });
  return data;
};

export const dryRunFleetImport = async (id: string, rowIds: string[]) => {
  const { data } = await api.post(`/admin/fleet-imports/${id}/dry-run`, { rowIds });
  return z.object({ canApply: z.boolean(), rows: z.array(z.object({ conflict: z.string().nullable() }).passthrough()) }).parse(data);
};

export const applyFleetImport = async (id: string, rowIds: string[], idempotencyKey: string) => {
  const { data } = await api.post(`/admin/fleet-imports/${id}/apply`, {
    rowIds, idempotencyKey, confirm: 'APPLY FLEET CHANGES',
  });
  return z.object({ importId: z.string().uuid(), status: z.enum(['partially_applied', 'applied']), appliedRows: z.array(z.record(z.string(), z.unknown())) }).passthrough().parse(data);
};

export const rejectFleetImportRows = async (id: string, rowIds: string[], reason: string) => {
  const { data } = await api.post(`/admin/fleet-imports/${id}/reject`, { rowIds, reason });
  return z.object({ rejected: z.number() }).parse(data);
};

export const cancelFleetImport = async (id: string) => {
  const { data } = await api.post(`/admin/fleet-imports/${id}/cancel`);
  return z.object({ success: z.boolean() }).parse(data);
};

export const downloadFleetImportRejectedRows = async (id: string) => {
  const { data } = await api.get(`/admin/fleet-imports/${id}/rejected.csv`, { responseType: 'blob' });
  return z.instanceof(Blob).parse(data);
};

export const fetchOperationalCustomers = async (
  params: AdminDatasetRequest = {},
  signal?: AbortSignal
): Promise<
  AdminDatasetResponse<OperationalCustomer>
> => {
  const { data } = await api.get('/customers', { params, signal });
  return data;
};

export const fetchOperationalInvoices = async (
  params: AdminDatasetRequest = {},
  signal?: AbortSignal
): Promise<
  AdminDatasetResponse<OperationalInvoice>
> => {
  const { data } = await api.get('/invoices', { params, signal });
  return data;
};

export interface ManualInvoicePayload {
  invoice_number?: string;
  status: ManualInvoiceStatus;
  issue_date: string;
  due_date?: string | null;
  bill_to_name: string;
  bill_to_abn_mobile?: string | null;
  vehicle_reference?: string | null;
  rental_period_reference?: string | null;
  notes?: string | null;
  additional_details?: string | null;
  items: ManualInvoiceItem[];
}

export const fetchManualInvoices = async (): Promise<ManualInvoice[]> => {
  const { data } = await api.get('/admin/manual-invoices');
  return data;
};

export const createManualInvoice = async (
  payload: ManualInvoicePayload
): Promise<ManualInvoice> => {
  const { data } = await api.post('/admin/manual-invoices', payload);
  return data;
};

export const fetchManualInvoicePdf = async (id: string): Promise<Blob> => {
  const { data } = await api.get(`/admin/manual-invoices/${id}/pdf`, {
    responseType: 'blob',
  });
  return data;
};

export const fetchRentalPlans = async (): Promise<PublicRentalPlan[]> => {
  const { data } = await api.get('/stripe/rental-plans');
  return data;
};

export interface ApplicationSubmissionResponse {
  application_id: string;
  checkout_token?: string;
  checkout_token_expires_at?: string;
  checkout_url?: string;
  lease_agreement_saved?: boolean;
  success: boolean;
}

export interface HostedCheckoutSessionResponse {
  checkout_url: string | null;
  session_id: string;
}

export interface CheckoutSessionStatusResponse {
  application_status:
    | 'Pending'
    | 'Paid'
    | 'Approved'
    | 'Rejected'
    | 'Payment Review'
    | 'Cancelled';
  checkout_kind: 'application' | 'vehicle' | null;
  customer_id: string | null;
  db_payment_activation_status: {
    application_status: string;
    activated: boolean;
    pending_checkout_session_id: string | null;
    rental_status: string | null;
  };
  id: string;
  internal_status: CheckoutSessionStatusState;
  metadata_match: {
    application_id: boolean;
    checkout_kind: boolean;
    matched: boolean;
    payment_link_version: boolean;
  };
  payment_method_type: string | null;
  payment_method_types: string[];
  payment_status: string | null;
  rental_status: 'Active' | 'Completed' | 'Cancelled' | 'Overdue' | null;
  state: CheckoutSessionStatusState;
  status: string | null;
  subscription_id: string | null;
}

export interface VehicleCheckoutLinkResponse {
  checkout_token: string;
  checkout_token_expires_at: string;
  checkout_url: string;
}

export interface ApplicationApprovalResponse extends VehicleCheckoutLinkResponse {
  email_delivered: boolean;
  email_reason: string | null;
  success: boolean;
}

export interface ApplicationActivationRetryResponse {
  status: 'Paid';
  success: boolean;
}

export interface ApprovedPaymentContextResponse {
  applicant_name: string;
  application_id: string;
  approved_vehicle: string;
  billing: {
    bond: number;
    bondMethod: string;
    bondStatus: string;
    currency: string;
    initialRental: number;
    recurringAmount: number;
    recurringInterval: 'week' | 'month';
    recurringIntervalCount: number;
    recurringLabel: string;
    setupFees: number;
    upfrontDue: number;
  };
  vehicle_image: string;
}

export const fetchApplicationDocumentUrl = async (
  applicationId: string,
  document:
    | 'license_photo'
    | 'license_back_photo'
    | 'passport_or_uber_profile_screenshot'
): Promise<{ url: string }> => {
  const { data } = await api.get(`/applications/${applicationId}/documents/${document}`);
  return data;
};

export const fetchApplicationAgreementTemplate = async (): Promise<ApplicationAgreementTemplateResponse> => {
  const { data } = await api.get('/applications/agreement-template');
  return data;
};

export const submitApplication = async (payload: FormData): Promise<ApplicationSubmissionResponse> => {
  const { data } = await api.post('/applications', payload);
  return data;
};

export const submitInquiry = async (
  payload: InquiryValues
): Promise<{ success: boolean }> => {
  const { data } = await api.post('/inquiries', payload);
  return data;
};

export const createVehicleCheckoutSession = async (payload: {
  application_id: string;
  checkout_token: string;
}): Promise<HostedCheckoutSessionResponse> => {
  const { data } = await api.post('/stripe/vehicle-checkout-session', payload);
  return data;
};

export const fetchApprovedPaymentContext = async (options: {
  application_id: string;
  checkout_token: string;
}): Promise<ApprovedPaymentContextResponse> => {
  const { checkout_token, ...params } = options;
  const { data } = await api.get('/stripe/payment-context', {
    params,
    headers: {
      'X-Checkout-Token': checkout_token,
    },
  });
  return data;
};

export const fetchCheckoutSessionStatus = async (
  sessionId: string,
  options: {
    application_id: string;
    checkout_token?: string | null;
  }
): Promise<CheckoutSessionStatusResponse> => {
  const { checkout_token, ...params } = options;
  const { data } = await api.get(`/stripe/checkout-sessions/${sessionId}`, {
    params,
    timeout: 15_000,
    headers: checkout_token
      ? {
          'X-Checkout-Token': checkout_token,
        }
      : undefined,
  });
  return data;
};

export interface StripeLeaseSettings {
  currency: string;
  recurring_interval: 'week';
  minimum_rental_weeks: number;
  insurance_coverage_region: string;
  fees: {
    account_management_weekly: number;
    new_account_setup: number;
    direct_debit_account_setup: number;
  };
}

export interface LeaseFeePayload {
  code: string;
  title: string;
  amount: string;
}

export interface LeaseAgreementPayload {
  agreementDate?: string;
  registeredOwnerName?: string;
  registeredOwnerAddress?: string;
  registeredOwnerContact?: string;
  registeredOwnerEmail?: string;
  renteeName?: string;
  renteeDob?: string;
  renteeLicenseNumber?: string;
  renteeLicenseState?: string;
  renteeAddress?: string;
  renteeContact?: string;
  renteeEmail?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleVin?: string;
  kmAllowance?: string;
  weeklyRent?: string;
  fuelPolicy?: string;
  insuranceCoverage?: string;
  rentalStartDate?: string;
  rentalEndDate?: string;
  minimumRentalPeriod?: string;
  returnPolicy?: string;
  fees?: LeaseFeePayload[];
  bondAmount?: string;
  bondNotes?: string;
  bondPaymentMethod?: string;
  bondPaymentStatus?: string;
}

export interface AgreementTemplatePreviewPayload extends LeaseAgreementPayload {
  content?: string;
}

export const createVehicleCheckoutLink = async (payload: {
  application_id: string;
}): Promise<VehicleCheckoutLinkResponse> => {
  const { data } = await api.post('/stripe/vehicle-checkout-link', payload);
  return data;
};

export const approveApplicationForPayment = async (
  id: string,
  payload: {
    approved_vehicle: string;
    approved_bond: number;
    bond_notes?: string | null;
    bond_payment_method?: 'cash' | 'existing_paid' | null;
    bond_payment_status?: 'to_collect' | 'cash_paid' | 'already_paid';
    approved_weekly_price: number;
    rental_subscription_start_date?: string;
    send_payment_link?: boolean;
  }
): Promise<ApplicationApprovalResponse> => {
  const { data } = await api.post(`/applications/${id}/approve-payment`, payload);
  return data;
};

export const retryApplicationPaymentActivation = async (
  id: string
): Promise<ApplicationActivationRetryResponse> => {
  const { data } = await api.post(`/applications/${id}/retry-payment-activation`);
  return data;
};

export const cancelApplication = async (
  id: string,
  payload: { cancel_reason?: string }
): Promise<{ success: boolean; application_status: 'Cancelled' }> => {
  const { data } = await api.post(`/applications/${id}/cancel`, payload);
  return data;
};

export const fetchCarLeaseTemplate = async (): Promise<string> => {
  const { data } = await api.get('/agreements/car-lease/template', {
    responseType: 'text',
  });
  return data;
};

export const renderCarLeaseAgreement = async (
  payload: LeaseAgreementPayload
): Promise<{ agreement: string; agreementTemplateVersion: number }> => {
  const { data } = await api.post('/agreements/car-lease/render', payload);
  return data;
};

export const fetchStripeLeaseSettings = async (): Promise<StripeLeaseSettings> => {
  const { data } = await api.get('/stripe/lease-settings');
  return data;
};

export interface SavedLeaseAgreement {
  agreement_template_version?: number | null;
  id: number;
  application_id: string;
  content: string;
  status: string;
  created_at: string;
  applicant_name?: string;
  car_name?: string;
  vehicle_label?: string | null;
}

export interface AgreementTemplate {
  active: boolean;
  content: string;
  created_at?: string | null;
  id: number;
  name: string;
  template_key: string;
  updated_at: string;
  updated_by?: string | null;
  version: number;
}

export const fetchAgreementTemplates = async (): Promise<AgreementTemplate[]> => {
  const { data } = await api.get('/admin/agreements');
  return data;
};

export const updateAgreementTemplate = async (
  id: number,
  payload: { content: string; name?: string }
): Promise<AgreementTemplate> => {
  const { data } = await api.put(`/admin/agreements/${id}`, payload);
  return data;
};

export const createAgreementTemplate = async (payload: {
  content: string;
  name: string;
  template_key?: string;
}): Promise<AgreementTemplate> => {
  const { data } = await api.post('/admin/agreements', payload);
  return data;
};

export const activateAgreementTemplate = async (id: number): Promise<AgreementTemplate> => {
  const { data } = await api.post(`/admin/agreements/${id}/activate`);
  return data;
};

export const previewAgreementTemplate = async (
  id: number,
  payload: AgreementTemplatePreviewPayload = {}
): Promise<{ agreement: string; agreementTemplateVersion: number }> => {
  const { data } = await api.post(`/admin/agreements/${id}/preview`, payload);
  return data;
};

export const saveLeaseAgreement = async (payload: {
  agreement_template_version?: number | null;
  application_id: string;
  content: string;
  status?: string;
  vehicle_label?: string | null;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/agreements', payload);
  return data;
};

export const fetchSavedLeaseAgreements = async (): Promise<SavedLeaseAgreement[]> => {
  const { data } = await api.get('/agreements');
  return data;
};

export const generateSavedAgreementPdf = async (id: number): Promise<{
  artifact_status: 'generating' | 'ready';
  signed_url?: string;
}> => {
  const { data } = await api.post(`/agreements/${id}/pdf`);
  return data;
};

export interface AgreementPdfStatus {
  artifact_status: 'pending' | 'generating' | 'ready' | 'failed';
  failure_code?: string | null;
  generated_at?: string | null;
  signed_url?: string;
}

export const fetchSavedAgreementPdfStatus = async (id: number): Promise<AgreementPdfStatus> => {
  const { data } = await api.get(`/agreements/${id}/pdf`);
  return data;
};

export interface WeeklyFinancials {
  projected_gross_weekly: number;
  projected_net_weekly: number;
  estimated_platform_fees: number;
  actual_payouts_weekly: number;
  imported_balance_gross?: number;
  imported_balance_net?: number;
  imported_balance_transactions?: Array<{
    id: string;
    type: string;
    amount: number;
    fee: number;
    net: number;
    currency: string;
    created_at: string;
    description?: string | null;
    source?: string | null;
    transfer?: string | null;
  }>;
  recent_payouts: Array<{
    id: string;
    amount: number;
    arrival_date: string;
    status: string;
  }>;
  recent_payouts_truncated?: boolean;
}

export interface WeeklyFinancialsRequest {
  endDate?: string;
  startDate?: string;
}

export const fetchWeeklyFinancials = async (
  params: WeeklyFinancialsRequest = {}
): Promise<WeeklyFinancials> => {
  const { data } = await api.get('/financials/weekly', { params });
  return data;
};

export interface TollNoticeRentalOption {
  application_id: string;
  applicant_name: string;
  car_name: string;
  customer_id: number | null;
  nominee_address: string;
  nominee_country: string;
  nominee_dob: string | null;
  nominee_full_name: string;
  nominee_given_names: string;
  nominee_phone: string;
  nominee_postcode: string;
  nominee_state: string;
  nominee_suburb: string;
  nominee_surname: string;
  rental_id: number;
  rental_status: string;
  vehicle_registration: string;
}

export interface TollTransferNoticePayload {
  application_id?: string | null;
  authorised_officer_name: string;
  customer_id?: number | null;
  declaration_date?: string | null;
  declaration_place: string;
  nominee_address: string;
  nominee_country: string;
  nominee_dob?: string | null;
  nominee_full_name: string;
  nominee_phone: string;
  nominee_postcode: string;
  nominee_state: string;
  nominee_suburb: string;
  rental_id?: number | null;
  responsible_type: 'responsible' | 'new-owner' | 'previous-owner';
  toll_notice_number?: string | null;
  toll_trip_date?: string | null;
  vehicle_registration: string;
  witness_jp_number?: string | null;
  witness_name?: string | null;
  witness_qualification?: string | null;
}

export interface TollTransferNoticeRecord extends TollTransferNoticePayload {
  id: number;
  created_at: string;
  created_by?: string | null;
  pdf_url?: string | null;
  sent_at?: string | null;
  sent_to?: string | null;
  status: 'draft' | 'generated' | 'sent';
  updated_at: string;
}

export interface SendTollTransferNoticeResponse {
  id: number;
  sent_at: string;
  sent_to: string;
  status: 'sent';
}

export const fetchTollNoticeRentalOptions = async (
  search = ''
): Promise<TollNoticeRentalOption[]> => {
  const { data } = await api.get('/toll-notices/rental-options', {
    params: { search },
  });
  return data.items || [];
};

export const fetchTollTransferNotices = async (): Promise<TollTransferNoticeRecord[]> => {
  const { data } = await api.get('/toll-notices');
  return data;
};

export const createTollTransferNotice = async (
  payload: TollTransferNoticePayload
): Promise<{ id: number; pdf_url: string; status: 'generated' }> => {
  const { data } = await api.post('/toll-notices', payload);
  return data;
};

export const fetchTollTransferNoticePdf = async (id: number): Promise<Blob> => {
  const { data } = await api.get(`/toll-notices/${id}/pdf`, {
    responseType: 'blob',
  });
  return data;
};

export const markTollTransferNoticeSent = async (
  id: number
): Promise<{ id: number; sent_at?: string | null; status: 'sent' }> => {
  const { data } = await api.patch(`/toll-notices/${id}/status`, { status: 'sent' });
  return data;
};

export const sendTollTransferNotice = async (
  id: number,
  payload: { recipient_email: string; recipient_name?: string | null }
): Promise<SendTollTransferNoticeResponse> => {
  const { data } = await api.post(`/toll-notices/${id}/send`, payload);
  return data;
};

export interface ImportedDataResetResponse {
  code?: string;
  errorCode?: string | null;
  success: boolean;
  dryRun?: boolean;
  criteria?: Record<string, string>;
  counts?: Record<string, number>;
  deleted?: Record<string, number>;
  resetEnabled?: boolean;
  rollbackSucceeded?: boolean | null;
  preserved?: {
    adminUsers: true;
    stripeExternalRecords: true;
    stripeWebhookEvents: true;
  };
  dryRunToken?: string;
  message: string;
}

export const resetImportedDataDryRun = async (): Promise<ImportedDataResetResponse> => {
  const { data } = await api.get('/admin/maintenance/imported-data-reset/dry-run');
  return data;
};

export const resetImportedDataAndFinancials = async (payload: {
  confirm: string;
  dryRunToken?: string;
  reason?: string;
}): Promise<ImportedDataResetResponse> => {
  const { data } = await api.post('/admin/maintenance/imported-data-reset', payload);
  return data;
};

export const exportImportedDataReset = async (): Promise<Record<string, unknown>> => {
  const { data } = await api.get('/admin/maintenance/imported-data-reset/export');
  return data;
};

export default api;
