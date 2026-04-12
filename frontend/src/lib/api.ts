import { appConfig } from '@/lib/config';
import { clearStoredSession, readStoredSession, writeStoredSession } from '@/lib/storage';
import type {
  AnalyticsOverview,
  ApiEnvelope,
  AuthSession,
  BackendHealth,
  CartItem,
  Canteen,
  CollegePublic,
  CollegeSummary,
  LoginPayload,
  ManagerAssignment,
  ManagerSummary,
  MenuItem,
  OrderPayment,
  OrderRecord,
  QrToken,
  RegistrationPayload,
  UserProfile
} from '@/types/api';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<AuthSession | null> | null = null;

const parseEnvelope = async <TData>(response: Response): Promise<TData> => {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<TData> | null;
  if (!payload) {
    throw new ApiError('The server returned an unreadable response.', response.status);
  }

  if (!response.ok || payload.success === false) {
    throw new ApiError(payload.message ?? 'Request failed', response.status, payload.details ?? payload.errors);
  }

  return payload.data as TData;
};

const parseRawJson = async <TData>(response: Response): Promise<TData> => {
  const payload = (await response.json().catch(() => null)) as TData | null;
  if (!payload) {
    throw new ApiError('The server returned an unreadable response.', response.status);
  }

  if (!response.ok) {
    throw new ApiError('Request failed', response.status, payload);
  }

  return payload;
};

const parseText = async (response: Response) => {
  const payload = await response.text().catch(() => '');
  if (!response.ok) {
    throw new ApiError(payload || 'Request failed', response.status);
  }

  return payload;
};

const refreshSession = async () => {
  const currentSession = readStoredSession();
  if (!currentSession?.refreshToken) {
    clearStoredSession();
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken: currentSession.refreshToken })
      });

      try {
        const refreshedTokens = await parseEnvelope<Pick<AuthSession, 'accessToken' | 'refreshToken'>>(response);
        if (!refreshedTokens) {
          clearStoredSession();
          return null;
        }

        const nextSession = {
          ...currentSession,
          ...refreshedTokens
        };
        writeStoredSession(nextSession);
        return nextSession;
      } catch {
        clearStoredSession();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
};

const fetchJson = async <TData>(path: string, options: RequestOptions = {}) => {
  const buildRequest = (session: AuthSession | null) => {
    const headers = new Headers(options.headers);

    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (options.auth !== false && session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }

    return fetch(`${appConfig.apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined
          ? undefined
          : typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body)
    });
  };

  let session = readStoredSession();
  let response = await buildRequest(session);

  if (response.status === 401 && options.auth !== false) {
    const refreshed = await refreshSession();
    if (refreshed?.accessToken) {
      session = refreshed;
      response = await buildRequest(session);
    }
  }

  return parseEnvelope<TData>(response);
};

const fetchPublicJson = async <TData>(url: string) => {
  const response = await fetch(url);
  return parseRawJson<TData>(response);
};

const fetchPublicText = async (url: string) => {
  const response = await fetch(url);
  return parseText(response);
};

export const api = {
  system: {
    serviceInfo: () => fetchPublicText(appConfig.backendBaseUrl),
    health: () => fetchPublicJson<BackendHealth>(`${appConfig.apiBaseUrl}/health`)
  },
  auth: {
    listTenants: () => fetchJson<CollegePublic[]>('/auth/tenants', { auth: false }),
    register: (payload: RegistrationPayload) => fetchJson<AuthSession>('/auth/register', { method: 'POST', auth: false, body: payload }),
    login: (payload: LoginPayload) => fetchJson<AuthSession>('/auth/login', { method: 'POST', auth: false, body: payload }),
    me: () => fetchJson<UserProfile>('/auth/me')
  },
  admin: {
    analytics: () => fetchJson<AnalyticsOverview>('/admin/analytics/overview'),
    listColleges: () => fetchJson<CollegeSummary[]>('/admin/colleges'),
    createCollege: (payload: {
      name: string;
      code: string;
      contactEmail: string;
      contactPhone?: string;
      address?: string;
      defaultCanteenName: string;
      defaultCanteenLocation?: string;
    }) => fetchJson<{ college: CollegeSummary; canteen: Canteen }>('/admin/colleges', { method: 'POST', body: payload }),
    updateCollege: (collegeId: string, payload: {
      name?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      isActive?: boolean;
    }) => fetchJson<CollegeSummary>(`/admin/colleges/${collegeId}`, { method: 'PUT', body: payload }),
    deactivateCollege: (collegeId: string) => fetchJson<CollegeSummary>(`/admin/colleges/${collegeId}`, { method: 'DELETE' }),
    listCollegeCanteens: (collegeId: string) => fetchJson<Canteen[]>(`/admin/colleges/${collegeId}/canteens`),
    listManagers: (collegeId: string) => fetchJson<ManagerSummary[]>(`/admin/colleges/${collegeId}/managers`),
    assignManager: (payload: {
      tenantId: string;
      canteenId: string;
      email: string;
      password: string;
      fullName: string;
      phone: string;
    }) => fetchJson<ManagerAssignment>('/admin/managers', { method: 'POST', body: payload })
  },
  customer: {
    menu: (canteenId?: string) => fetchJson<MenuItem[]>(`/customer/menu${canteenId ? `?canteenId=${canteenId}` : ''}`),
    getCart: () => fetchJson<CartItem[]>('/customer/cart'),
    setCart: (items: CartItem[]) => fetchJson<CartItem[]>('/customer/cart', { method: 'PUT', body: { items } }),
    clearCart: () => fetchJson<void>('/customer/cart', { method: 'DELETE' }),
    createOrder: (payload: { canteenId: string; items: CartItem[] }) =>
      fetchJson<OrderRecord>('/customer/orders', { method: 'POST', body: payload }),
    listOrders: () => fetchJson<OrderRecord[]>('/customer/orders'),
    getQr: (orderId: string) => fetchJson<QrToken>(`/customer/orders/${orderId}/qr`),
    initiatePayment: (orderId: string, idempotencyKey: string) =>
      fetchJson<OrderPayment>(`/customer/orders/${orderId}/payments/initiate`, {
        method: 'POST',
        body: { idempotencyKey }
      }),
    verifyPayment: (payload: {
      providerOrderId: string;
      providerPaymentId: string;
      signature: string;
    }) => fetchJson<{ payment: OrderPayment; order: OrderRecord }>('/customer/payments/verify', { method: 'POST', body: payload }),
    reportIssue: (orderId: string, reason: string) =>
      fetchJson<OrderRecord>(`/customer/orders/${orderId}/issues`, { method: 'POST', body: { reason } })
  },
  manager: {
    menuItems: (canteenId?: string) =>
      fetchJson<MenuItem[]>(`/manager/menu-items${canteenId ? `?canteenId=${canteenId}` : ''}`),
    createMenuItem: (payload: {
      canteenId: string;
      name: string;
      description?: string;
      category?: string;
      priceInPaise: number;
      stockQuantity: number;
      isAvailable: boolean;
      imageBase64?: string;
    }) => fetchJson<MenuItem>('/manager/menu-items', { method: 'POST', body: payload }),
    updateMenuItem: (menuItemId: string, payload: {
      canteenId?: string;
      name?: string;
      description?: string;
      category?: string;
      priceInPaise?: number;
      stockQuantity?: number;
      isAvailable?: boolean;
      imageBase64?: string;
    }) => fetchJson<MenuItem>(`/manager/menu-items/${menuItemId}`, { method: 'PUT', body: payload }),
    deleteMenuItem: (menuItemId: string) => fetchJson<{ deleted: boolean }>(`/manager/menu-items/${menuItemId}`, { method: 'DELETE' }),
    orders: (status?: string) => fetchJson<OrderRecord[]>(`/manager/orders${status ? `?status=${status}` : ''}`),
    scanQr: (signedToken: string) =>
      fetchJson<{ qrToken: QrToken; order: OrderRecord }>('/manager/orders/scan-qr', {
        method: 'POST',
        body: { signedToken }
      }),
    updateOrderStatus: (orderId: string, payload: { nextStatus: string; reason?: string }) =>
      fetchJson<OrderRecord | { refundId: string }>(`/manager/orders/${orderId}/status`, {
        method: 'PATCH',
        body: payload
      }),
    paymentReport: () => fetchJson<OrderPayment[]>('/manager/payments/report')
  },
  payments: {
    replayWebhook: (payload: Record<string, unknown>, signature: string) =>
      fetchJson<{ processed: boolean; status?: string; reason?: string }>('/payments/webhooks/razorpay', {
        method: 'POST',
        auth: false,
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature
        }
      })
  }
};
