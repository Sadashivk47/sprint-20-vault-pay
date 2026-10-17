export type UserRole = 'admin' | 'client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export interface Invoice {
  id: string;
  clientId: string;
  clientName?: string;
  clientEmail?: string;
  amount: number;
  description: string;
  status: 'unpaid' | 'paid';
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  pdfUrl: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string | null;
  userRole: string | null;
  action: string;
  resourceId: string | null;
  httpStatus: number;
  reason: string | null;
  ipAddress: string | null;
}

export interface DemoAccount {
  role: UserRole;
  name: string;
  email: string;
  password: string;
  description: string;
}
