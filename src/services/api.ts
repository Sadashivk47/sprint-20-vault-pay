import { Invoice, User, AuditLog, DemoAccount } from '../types';

const TOKEN_KEY = 'vaultpay_jwt_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

interface RequestOptions extends RequestInit {
  token?: string | null;
}

export async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token !== undefined ? options.token : getStoredToken();

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; [key: string]: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: response.statusText };
    }

    const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`) as Error & {
      status: number;
      code?: string;
      data?: unknown;
    };
    error.status = response.status;
    error.code = errorData.code;
    error.data = errorData;
    throw error;
  }

  return response.json() as Promise<T>;
}

export const api = {
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      token: null,
    });
    setStoredToken(res.token);
    return res;
  },

  async getMe(): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('/api/auth/me');
  },

  logout(): void {
    setStoredToken(null);
  },

  async getInvoices(): Promise<{ invoices: Invoice[]; role: string }> {
    return apiFetch<{ invoices: Invoice[]; role: string }>('/api/invoices');
  },

  async getInvoiceById(id: string): Promise<{ invoice: Invoice }> {
    return apiFetch<{ invoice: Invoice }>(`/api/invoices/${encodeURIComponent(id)}`);
  },

  async createInvoice(data: { clientId: string; amount: number; description: string }): Promise<{ invoice: Invoice }> {
    return apiFetch<{ invoice: Invoice }>('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createCheckoutSession(invoiceId: string): Promise<{ url: string; sessionId: string; isMock: boolean }> {
    return apiFetch<{ url: string; sessionId: string; isMock: boolean }>(
      `/api/invoices/${encodeURIComponent(invoiceId)}/checkout-session`,
      { method: 'POST' }
    );
  },

  async getClients(): Promise<{ clients: Array<Pick<User, 'id' | 'name' | 'email' | 'createdAt'>> }> {
    return apiFetch<{ clients: Array<Pick<User, 'id' | 'name' | 'email' | 'createdAt'>> }>('/api/invoices/meta/clients');
  },

  async getAuditLogs(): Promise<{ logs: AuditLog[] }> {
    return apiFetch<{ logs: AuditLog[] }>('/api/invoices/meta/audit-logs');
  },

  async getDemoAccounts(): Promise<{ accounts: DemoAccount[] }> {
    return apiFetch<{ accounts: DemoAccount[] }>('/api/auth/demo-accounts', { token: null });
  },

  async simulateWebhookPayment(invoiceId: string): Promise<{ message: string; verifiedInvoice: Invoice; signatureHeader: string }> {
    return apiFetch<{ message: string; verifiedInvoice: Invoice; signatureHeader: string }>('/api/qa/trigger-signed-webhook', {
      method: 'POST',
      body: JSON.stringify({ invoiceId }),
    });
  },

  async testEmailReceipt(recipientEmail: string, invoiceId?: string): Promise<{
    success: boolean;
    recipient: string;
    messageId?: string;
    previewUrl?: string | false;
    note: string;
  }> {
    return apiFetch<{
      success: boolean;
      recipient: string;
      messageId?: string;
      previewUrl?: string | false;
      note: string;
    }>('/api/qa/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipientEmail, invoiceId }),
    });
  },

  getPdfUrl(invoiceId: string): string {
    return `/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
  },
};
