export interface Car {
  id: number;
  name: string;
  model_year: number;
  weekly_price: number;
  bond: number;
  status: 'Available' | 'Rented' | 'Maintenance';
  image: string;
}

export interface Application {
  id: number;
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
  uber_screenshot?: string;
  status: 'Pending' | 'Paid' | 'Approved' | 'Rejected';
  created_at: string;
}

export interface Rental {
  id: number;
  application_id: number;
  car_id: number;
  applicant_name?: string;
  car_name?: string;
  start_date: string;
  weekly_price: number;
  status: 'Active' | 'Completed' | 'Cancelled';
  created_at: string;
}

export interface DashboardStats {
  total_applications: number;
  active_rentals: number;
  total_weekly_income: number;
}

export interface SaasMerchant {
  id: number;
  name: string;
  email: string;
  country: string;
  stripe_account_id: string;
  payout_interval: 'daily' | 'weekly' | 'monthly';
  onboarding_status: string;
  created_at: string;
}
