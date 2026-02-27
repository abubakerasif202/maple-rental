import axios from 'axios';

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

export const fetchCars = async () => {
  const { data } = await api.get('/cars');
  return data;
};

export const fetchCar = async (id: string) => {
  const { data } = await api.get(`/cars/${id}`);
  return data;
};

export const createCheckoutSession = async (bookingData: any) => {
  const { data } = await api.post('/bookings', bookingData);
  return data;
};

export default api;
