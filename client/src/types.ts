import {
  APPLICATION_STATUSES,
  DRIVER_STATUSES,
  PAYMENT_STATUSES,
  SUBSCRIPTION_STATUSES,
  USER_ROLES,
  VEHICLE_STATUSES,
} from '@shared/contracts.js';

export type UserRole = (typeof USER_ROLES)[number];
export type DriverStatus = (typeof DRIVER_STATUSES)[number];
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  plate_number: string;
  weekly_rate: number;
  bond_amount: number;
  image_url?: string | null;
  status: VehicleStatus;
  features?: string[] | null;
};

export type SessionUser = {
  id: string;
  authUserId: string;
  email: string;
  role: UserRole;
  status: DriverStatus;
};

export type ApplicationRecord = {
  id: string;
  driver_id: string;
  vehicle_id: string;
  status: ApplicationStatus;
  preferred_start_date?: string | null;
  notes?: string | null;
  vehicles?: Vehicle;
  drivers?: {
    full_name: string;
    email: string;
    phone?: string | null;
    status?: DriverStatus;
  };
};

export type SubscriptionRecord = {
  id: string;
  application_id: string;
  vehicle_id: string;
  stripe_subscription_id?: string | null;
  status: SubscriptionStatus;
  weekly_rate: number;
  bond_amount: number;
  current_period_start?: string | null;
  current_period_end?: string | null;
  vehicles?: Vehicle;
};

export type PaymentRecord = {
  id: string;
  subscription_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paid_at?: string | null;
  failure_message?: string | null;
};

export type ContractRecord = {
  id: string;
  storage_path: string;
  file_name: string;
  signed_url?: string | null;
  status: string;
};

export type NotificationRecord = {
  id: string;
  channel: string;
  template_key: string;
  body: string;
  status: string;
  created_at: string;
};

export type DriverDashboard = {
  driver: {
    id: string;
    full_name: string;
    email: string;
    phone?: string | null;
    status: DriverStatus;
    current_vehicle_id?: string | null;
  };
  applications: ApplicationRecord[];
  subscriptions: SubscriptionRecord[];
  currentVehicle: Vehicle | null;
  notifications: NotificationRecord[];
};

export type BillingSummary = {
  driver: DriverDashboard['driver'];
  subscriptions: SubscriptionRecord[];
  payments: PaymentRecord[];
  contracts: ContractRecord[];
};

export type AdminSnapshot = {
  summary: {
    pendingApplications: number;
    activeSubscriptions: number;
    overduePayments: number;
    vehicleInventory: number;
  };
  pendingApplications: ApplicationRecord[];
  vehicles: Vehicle[];
  recentSubscriptions: SubscriptionRecord[];
  recentPayments: PaymentRecord[];
  notifications: NotificationRecord[];
};

export type LoginResponse = {
  token: string;
  user: SessionUser;
};
