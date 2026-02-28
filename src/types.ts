export interface Car {
  id: number;
  name: string;
  modelYear: number;
  weeklyPrice: number;
  bond: number;
  status: 'Available' | 'Rented' | 'Maintenance';
  image: string;
}

export interface Application {
  id: number;
  name: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string;
  uberStatus: 'Active' | 'Applying' | 'Not Yet Registered';
  experience: string;
  address: string;
  weeklyBudget: string;
  intendedStartDate: string;
  licensePhoto?: string;
  uberScreenshot?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
}

export interface Rental {
  id: number;
  applicationId: number;
  carId: number;
  applicantName?: string;
  carName?: string;
  startDate: string;
  weeklyPrice: number;
  status: 'Active' | 'Completed' | 'Cancelled';
  createdAt: string;
}

export interface DashboardStats {
  totalApplications: number;
  activeRentals: number;
  totalWeeklyIncome: number;
}

export interface SaasMerchant {
  id: number;
  name: string;
  email: string;
  country: string;
  stripeAccountId: string;
  payoutInterval: 'daily' | 'weekly' | 'monthly';
  onboardingStatus: string;
  createdAt: string;
}
