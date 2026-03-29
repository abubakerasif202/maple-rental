import type {
  AdminSnapshot,
  BillingSummary,
  DriverDashboard,
  LoginResponse,
  Vehicle,
} from '@/types';

const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const readToken = () => {
  const raw = window.localStorage.getItem('maple-auth');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed.state?.token || null;
  } catch {
    return null;
  }
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  getMe() {
    return request<{ user: LoginResponse['user']; dashboard: DriverDashboard | null }>('/api/auth/me');
  },
  getVehicles() {
    return request<{ vehicles: Vehicle[] }>('/api/vehicles');
  },
  submitApplication(payload: Record<string, unknown>) {
    return request('/api/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getBilling() {
    return request<BillingSummary>('/api/billing');
  },
  subscribe(payload: Record<string, unknown>) {
    return request<{ url?: string; sessionId?: string }>('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getAdmin() {
    return request<AdminSnapshot>('/api/admin');
  },
  approveApplication(applicationId: string) {
    return request(`/api/admin/applications/${applicationId}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  rejectApplication(applicationId: string, reason: string) {
    return request(`/api/admin/applications/${applicationId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};
