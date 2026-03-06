import axios from 'axios';
import { Car, Application, Rental, DashboardStats, SaasMerchant } from '../types';
import type { RentalPlanWithPricing } from './rentalPlans';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true, // Necessary for HTTP-only cookies
});

// Global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Avoid redirect loops on login page
      if (!window.location.pathname.includes('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

export const logoutAdmin = async (): Promise<{ message: string }> => {
  const { data } = await api.post('/auth/logout');
  return data;
};

export const fetchCars = async (): Promise<Car[]> => {
  const { data } = await api.get('/cars');
  return data;
};

export const fetchCar = async (id: string): Promise<Car> => {
  const { data } = await api.get(`/cars/${id}`);
  return data;
};

export const createCar = async (carData: Partial<Car>): Promise<{ id: string }> => {
  const { data } = await api.post('/cars', carData);
  return data;
};

export const updateCar = async (id: number, carData: Partial<Car>): Promise<{ success: boolean }> => {
  const { data } = await api.put(`/cars/${id}`, carData);
  return data;
};

export const deleteCar = async (id: number): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/cars/${id}`);
  return data;
};

export const fetchApplications = async (): Promise<Application[]> => {
  const { data } = await api.get('/applications');
  return data;
};

export const updateApplicationStatus = async (id: number, status: string): Promise<{ success: boolean }> => {
  const { data } = await api.put(`/applications/${id}/status`, { status });
  return data;
};

export const fetchStats = async (): Promise<DashboardStats> => {
  const { data } = await api.get('/stats');
  return data;
};

export const fetchRentals = async (): Promise<Rental[]> => {
  const { data } = await api.get('/rentals');
  return data;
};

export const createCheckoutSession = async (bookingData: any): Promise<any> => {
  const { data } = await api.post('/bookings', bookingData);
  return data;
};

export const fetchRentalPlans = async (): Promise<RentalPlanWithPricing[]> => {
  const { data } = await api.get('/rental-plans');
  return data;
};

export interface CreateSaasMerchantPayload {
  business_name: string;
  email: string;
  country?: string;
  payout_interval?: 'daily' | 'weekly' | 'monthly';
}

export interface SaasMerchantResponse {
  merchant: SaasMerchant;
  onboarding_link: string | null;
  onboarding_expires_at: string | null;
}

export interface SaasAccountLinkResponse {
  onboarding_link: string | null;
  onboarding_expires_at: string | null;
}

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
  agreement_date?: string;
  registered_owner_name?: string;
  registered_owner_address?: string;
  registered_owner_contact?: string;
  registered_owner_email?: string;
  rentee_name?: string;
  rentee_dob?: string;
  rentee_license_number?: string;
  rentee_license_state?: string;
  rentee_address?: string;
  rentee_contact?: string;
  rentee_email?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  vehicle_vin?: string;
  km_allowance?: string;
  weekly_rent?: string;
  fuel_policy?: string;
  insurance_coverage?: string;
  rental_start_date?: string;
  rental_end_date?: string;
  minimum_rental_period?: string;
  return_policy?: string;
  fees?: LeaseFeePayload[];
}

export const fetchSaasMerchants = async (): Promise<SaasMerchant[]> => {
  const { data } = await api.get('/saas/merchants');
  return data;
};

export const createSaasMerchant = async (
  payload: CreateSaasMerchantPayload
): Promise<SaasMerchantResponse> => {
  const { data } = await api.post('/saas/merchants', payload);
  return data;
};

export const refreshSaasAccountLink = async (
  merchantId: number
): Promise<SaasAccountLinkResponse> => {
  const { data } = await api.post(`/saas/merchants/${merchantId}/link`);
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
): Promise<{ agreement: string }> => {
  const { data } = await api.post('/agreements/car-lease/render', payload);
  return data;
};

export const fetchStripeLeaseSettings = async (): Promise<StripeLeaseSettings> => {
  const { data } = await api.get('/stripe/lease-settings');
  return data;
};

export interface SavedLeaseAgreement {
  id: number;
  application_id: number;
  car_id: number;
  content: string;
  status: string;
  created_at: string;
  applicant_name?: string;
  car_name?: string;
}

export const saveLeaseAgreement = async (payload: {
  application_id: number;
  car_id: number;
  content: string;
  status?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/agreements', payload);
  return data;
};

export const fetchSavedLeaseAgreements = async (): Promise<SavedLeaseAgreement[]> => {
  const { data } = await api.get('/agreements');
  return data;
};

export const deleteSavedLeaseAgreement = async (id: number): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/agreements/${id}`);
  return data;
};

export interface WeeklyFinancials {
  projected_gross_weekly: number;
  projected_net_weekly: number;
  estimated_platform_fees: number;
  actual_payouts_weekly: number;
  recent_payouts: Array<{
    id: string;
    amount: number;
    arrival_date: string;
    status: string;
  }>;
}

export const fetchWeeklyFinancials = async (): Promise<WeeklyFinancials> => {
  const { data } = await api.get('/financials/weekly');
  return data;
};

export default api;
