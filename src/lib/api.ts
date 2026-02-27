import axios from 'axios';
import { Car, Application, Rental, DashboardStats } from '../types';

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

export default api;
