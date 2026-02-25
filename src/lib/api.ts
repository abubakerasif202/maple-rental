import type { Car, Booking } from '../types';

const API_URL = '/api';

export const fetchCars = async (): Promise<Car[]> => {
  const res = await fetch(`${API_URL}/cars`);
  if (!res.ok) throw new Error('Failed to fetch cars');
  return res.json();
};

export const fetchCar = async (id: string): Promise<Car> => {
  const res = await fetch(`${API_URL}/cars/${id}`);
  if (!res.ok) throw new Error('Failed to fetch car');
  return res.json();
};

export const createCheckoutSession = async (bookingData: Partial<Booking>) => {
  const res = await fetch(`${API_URL}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create booking');
  return data;
};

export const authFetch = (url: string, init?: RequestInit) =>
  fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.headers || {}),
    },
  });
