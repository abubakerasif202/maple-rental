import axios from 'axios';
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

export const activateRental = async (applicationId: string): Promise<{ success: boolean; rental: Rental }> => {
  const { data } = await api.post(`/rentals/applications/${applicationId}/activate`);
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
