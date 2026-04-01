export type DashboardStats = {
  total_users: number;
  total_customers: number;
  total_drivers: number;
  pending_driver_reviews: number;
  total_bookings: number;
  active_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  gross_revenue: number;
  net_driver_payout: number;
};

export type DriverItem = {
  id: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  rating: number;
  is_available: boolean;
  is_banned?: boolean;
  banned_at?: string | null;
  banned_reason?: string | null;
  profile_status: 'pending' | 'approved' | 'rejected';
  documents_status: 'pending' | 'submitted' | 'approved' | 'rejected';
  documents: Record<string, string | null>;
  stats: {
    total_jobs: number;
    completed_jobs: number;
    cancelled_jobs: number;
  };
  created_at?: string | null;
};

export type DriverReviewItem = {
  booking_id: number;
  customer_name: string;
  rating: number;
  review: string;
  created_at?: string | null;
};

export type DriverBookingItem = {
  id: number;
  status: string;
  service: string;
  vehicle: string;
  address: string;
  price: number;
  scheduled_at?: string | null;
  cancelled_reason?: string | null;
  before_photos?: string[];
  after_photos?: string[];
  customer: {
    id?: number | null;
    name?: string | null;
    phone?: string | null;
  };
  created_at?: string | null;
};

export type DriverDetails = {
  driver: {
    id: number;
    name: string;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    profile_status: 'pending' | 'approved' | 'rejected';
    documents_status: 'pending' | 'submitted' | 'approved' | 'rejected';
    documents: Record<string, string | null>;
    is_available: boolean;
    is_banned: boolean;
    banned_at?: string | null;
    banned_reason?: string | null;
    created_at?: string | null;
  };
  metrics: {
    rating_average: number;
    ratings_count: number;
    total_jobs: number;
    completed_jobs: number;
    cancelled_jobs: number;
  };
  reviews: DriverReviewItem[];
  bookings: DriverBookingItem[];
};

export type CustomerItem = {
  id: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  wallet_balance: number;
  stats: {
    total_orders: number;
    pending_orders: number;
    completed_orders: number;
  };
  created_at?: string | null;
};

export type BookingItem = {
  id: number;
  status: string;
  service: string;
  vehicle: string;
  address: string;
  price: number;
  scheduled_at?: string | null;
  cancelled_reason?: string | null;
  before_photos?: string[];
  after_photos?: string[];
  customer: {
    id?: number | null;
    name?: string | null;
    phone?: string | null;
  };
  driver: {
    id?: number | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  created_at?: string | null;
};

export type AnnouncementItem = {
  id: number;
  channel: string;
  title: string;
  body: string;
  audience: 'all' | 'approved' | 'pending' | 'rejected' | string;
  route?: string | null;
  sent_count: number;
  meta?: Record<string, unknown>;
  created_at?: string | null;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  const rawText = await response.text().catch(() => '');
  let data: any = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }
  }
  if (!response.ok) {
    throw new Error(data?.message || `Erreur API (${response.status})`);
  }
  return data as T;
}

export async function getDashboardStats() {
  return request<{ stats: DashboardStats }>('/admin/dashboard');
}

export async function getDrivers(params?: { status?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.q) search.set('q', params.q);
  const qs = search.toString();
  return request<{ drivers: DriverItem[] }>(`/admin/drivers${qs ? `?${qs}` : ''}`);
}

export async function reviewDriver(driverId: number, decision: 'approve' | 'reject') {
  return request<{ driver: { id: number; profile_status: string; documents_status: string } }>(
    `/admin/drivers/${driverId}/review`,
    {
      method: 'PATCH',
      body: JSON.stringify({ decision }),
    }
  );
}

export async function getDriverDetails(driverId: number) {
  return request<DriverDetails>(`/admin/drivers/${driverId}`);
}

export async function setDriverBan(driverId: number, payload: { banned: boolean; reason?: string }) {
  return request<{
    driver: {
      id: number;
      is_banned: boolean;
      banned_at?: string | null;
      banned_reason?: string | null;
      is_available: boolean;
    };
  }>(`/admin/drivers/${driverId}/ban`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getCustomers(params?: { q?: string }) {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  const qs = search.toString();
  return request<{ customers: CustomerItem[] }>(`/admin/customers${qs ? `?${qs}` : ''}`);
}

export async function getBookings(params?: { status?: string }) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  return request<{ bookings: BookingItem[] }>(`/admin/bookings${qs ? `?${qs}` : ''}`);
}

export async function sendDriverAnnouncement(payload: {
  title: string;
  body: string;
  audience?: 'all' | 'approved' | 'pending' | 'rejected';
  route?: string;
}) {
  return request<{ ok: boolean; sent: number }>('/admin/announcements/drivers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAnnouncements(params?: { channel?: 'driver_system'; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.channel) search.set('channel', params.channel);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return request<{ announcements: AnnouncementItem[] }>(`/admin/announcements${qs ? `?${qs}` : ''}`);
}

export { API_BASE };
