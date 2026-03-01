import axios from 'axios';
import { Car, Application, Rental, DashboardStats, SaasMerchant } from '../types';

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

export interface CreateSaasMerchantPayload {
  businessName: string;
  email: string;
  country?: string;
  payoutInterval?: 'daily' | 'weekly' | 'monthly';
}

export interface SaasMerchantResponse {
  merchant: SaasMerchant;
  onboardingLink: string | null;
  onboardingExpiresAt: string | null;
}

export interface SaasAccountLinkResponse {
  onboardingLink: string | null;
  onboardingExpiresAt: string | null;
}

export interface StripeLeaseSettings {
  currency: string;
  recurringInterval: 'week';
  minimumRentalWeeks: number;
  insuranceCoverageRegion: string;
  fees: {
    accountManagementWeekly: number;
    newAccountSetup: number;
    directDebitAccountSetup: number;
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

export default api;
