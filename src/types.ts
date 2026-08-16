export interface Application {
  approved_at?: string | null;
  approved_bond?: number | null;
  bond_notes?: string | null;
  bond_payment_method?: 'cash' | 'existing_paid' | null;
  bond_payment_status?: 'to_collect' | 'cash_paid' | 'already_paid' | null;
  approved_vehicle?: string | null;
  approved_weekly_price?: number | null;
  agreement_accepted_at?: string | null;
  agreement_signature?: string | null;
  agreement_template_version?: number | null;
  id: string;
  name: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry: string;
  uber_status: 'Active' | 'Applying' | 'Not Yet Registered';
  experience: string;
  address: string;
  weekly_budget: string;
  intended_start_date: string;
  license_photo?: string;
  license_back_photo?: string;
  passport_or_uber_profile_screenshot?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  paid_at?: string | null;
  payment_link_sent_at?: string | null;
  payment_link_version?: number;
  pending_checkout_session_id?: string | null;
  status: 'Pending' | 'Paid' | 'Approved' | 'Rejected' | 'Payment Review' | 'Cancelled';
  created_at: string;
}

export interface Rental {
  id: number;
  application_id: string;
  bond_paid?: number;
  vehicle_registration?: string | null;
  applicant_name?: string;
  car_name?: string;
  start_date: string;
  weekly_price: number;
  status: 'Active' | 'Completed' | 'Cancelled' | 'Overdue' | 'Paid — Awaiting Rental Activation';
  pending_activation?: boolean;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  created_at: string;
}

export type BondStatus = 'unpaid' | 'paid_manually' | 'waived' | 'refunded';

export type ManualInvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled';

export interface ManualInvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  gst: number;
  amount?: number;
  sort_order?: number;
}

export interface ManualInvoice {
  id: string;
  invoice_number: string;
  status: ManualInvoiceStatus;
  issue_date: string;
  due_date?: string | null;
  bill_to_name: string;
  bill_to_abn_mobile?: string | null;
  vehicle_reference?: string | null;
  rental_period_reference?: string | null;
  notes?: string | null;
  additional_details?: string | null;
  subtotal: number;
  gst: number;
  total_inc_gst: number;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  items: ManualInvoiceItem[];
}

export interface DashboardStats {
  total_applications: number;
  active_rentals: number;
  total_weekly_income: number;
}

export interface DashboardSummaryMetric {
  count?: number | null;
  currency?: string | null;
  label: string;
  value: number;
}

export interface DashboardSummaryTrendPoint {
  label: string;
  applications: number;
  paidApplications: number;
  rentals: number;
  revenue: number;
  audits: number;
}

export interface DashboardSummaryEvent {
  actor?: string | null;
  amount?: number | null;
  created_at: string;
  id: string;
  status?: string | null;
  subtitle?: string | null;
  title: string;
  type: string;
}

export interface DashboardSummaryResponse {
  active_rentals: number;
  agreements_generated: number;
  agreements_awaiting_attention: number;
  applications_by_status: Record<string, number>;
  outstanding_invoices: number;
  overdue_invoices: number;
  pending_applications: number;
  paid_applications: number;
  recent_admin_actions: DashboardSummaryEvent[];
  recent_applications: Array<
    Pick<Application, 'id' | 'name' | 'status' | 'created_at' | 'approved_vehicle'>
  >;
  recent_payments: DashboardSummaryEvent[];
  recent_rental_activity: DashboardSummaryEvent[];
  revenue_trend: DashboardSummaryTrendPoint[];
  status_distribution: Array<{ label: string; value: number }>;
  summary_generated_at: string;
  total_applications: number;
  total_customers: number;
  total_weekly_income: number;
  weekly_recurring_revenue: number;
}

export interface AdminDatasetResponse<T> {
  available: boolean;
  items: T[];
  message?: string;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface OperationalCustomer {
  id: number;
  application_id?: string | null;
  stripe_customer_id?: string | null;
  external_id?: string | null;
  staff_number?: string | null;
  full_name: string;
  preferred_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  street?: string | null;
  city?: string | null;
  postcode?: string | null;
  state?: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  invoice_count: number;
  total_billed: number;
  outstanding_balance: number;
  last_invoice_date?: string | null;
}

export interface OperationalInvoice {
  id: string;
  external_invoice_number: string;
  customer_id?: number | null;
  customer_name: string;
  car_registration?: string | null;
  invoice_date: string;
  due_label?: string | null;
  amount: number;
  balance: number;
  transaction_summary?: string | null;
  source: string;
  created_at: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  status: 'Open' | 'Paid';
}
