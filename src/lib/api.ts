const API_URL = '/api';

export const fetchCars = async () => {
  const res = await fetch(`${API_URL}/cars`);
  if (!res.ok) throw new Error('Failed to fetch cars');
  return res.json();
};

export const fetchCar = async (id: string) => {
  const res = await fetch(`${API_URL}/cars/${id}`);
  if (!res.ok) throw new Error('Failed to fetch car');
  return res.json();
};

export const createCheckoutSession = async (bookingData: any) => {
  const res = await fetch(`${API_URL}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create booking');
  return data;
};
