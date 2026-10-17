import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'vaultpay.db');
export const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL mode for reliability
db.exec('PRAGMA foreign_keys = ON;');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'client')),
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    clientId TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('unpaid', 'paid')),
    stripeSessionId TEXT,
    stripePaymentIntentId TEXT,
    pdfUrl TEXT,
    createdAt TEXT NOT NULL,
    paidAt TEXT,
    FOREIGN KEY (clientId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS security_audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    userId TEXT,
    userRole TEXT,
    action TEXT NOT NULL,
    resourceId TEXT,
    httpStatus INTEGER NOT NULL,
    reason TEXT,
    ipAddress TEXT
  );
`);

export interface DbUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'client';
  createdAt: string;
}

export interface DbInvoice {
  id: string;
  clientId: string;
  amount: number;
  description: string;
  status: 'unpaid' | 'paid';
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  pdfUrl: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface DbAuditLog {
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

// User repository
export function getUserByEmail(email: string): DbUser | null {
  const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
  const user = stmt.get(email) as unknown as DbUser | undefined;
  return user || null;
}

export function getUserById(id: string): DbUser | null {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
  const user = stmt.get(id) as unknown as DbUser | undefined;
  return user || null;
}

export function getAllClients(): Array<Pick<DbUser, 'id' | 'name' | 'email' | 'createdAt'>> {
  const stmt = db.prepare('SELECT id, name, email, createdAt FROM users WHERE role = ? ORDER BY name ASC');
  return stmt.all('client') as unknown as Array<Pick<DbUser, 'id' | 'name' | 'email' | 'createdAt'>>;
}

export function createUser(user: Omit<DbUser, 'createdAt'> & { createdAt?: string }): DbUser {
  const createdAt = user.createdAt || new Date().toISOString();
  const stmt = db.prepare(
    'INSERT INTO users (id, name, email, passwordHash, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(user.id, user.name, user.email.toLowerCase(), user.passwordHash, user.role, createdAt);
  return { ...user, createdAt };
}

// Invoice repository
export function getInvoiceById(id: string): DbInvoice | null {
  const stmt = db.prepare('SELECT * FROM invoices WHERE id = ? LIMIT 1');
  const invoice = stmt.get(id) as unknown as DbInvoice | undefined;
  return invoice || null;
}

export function getInvoiceByStripeSessionId(sessionId: string): DbInvoice | null {
  const stmt = db.prepare('SELECT * FROM invoices WHERE stripeSessionId = ? LIMIT 1');
  const invoice = stmt.get(sessionId) as unknown as DbInvoice | undefined;
  return invoice || null;
}

export function getAllInvoices(): Array<DbInvoice & { clientName: string; clientEmail: string }> {
  const stmt = db.prepare(`
    SELECT i.*, u.name AS clientName, u.email AS clientEmail
    FROM invoices i
    JOIN users u ON i.clientId = u.id
    ORDER BY i.createdAt DESC
  `);
  return stmt.all() as unknown as Array<DbInvoice & { clientName: string; clientEmail: string }>;
}

export function getInvoicesForClient(clientId: string): Array<DbInvoice & { clientName: string; clientEmail: string }> {
  const stmt = db.prepare(`
    SELECT i.*, u.name AS clientName, u.email AS clientEmail
    FROM invoices i
    JOIN users u ON i.clientId = u.id
    WHERE i.clientId = ?
    ORDER BY i.createdAt DESC
  `);
  return stmt.all(clientId) as unknown as Array<DbInvoice & { clientName: string; clientEmail: string }>;
}

export function createInvoice(invoice: {
  id: string;
  clientId: string;
  amount: number;
  description: string;
  status?: 'unpaid' | 'paid';
  createdAt?: string;
}): DbInvoice {
  const createdAt = invoice.createdAt || new Date().toISOString();
  const status = invoice.status || 'unpaid';
  const stmt = db.prepare(`
    INSERT INTO invoices (id, clientId, amount, description, status, stripeSessionId, stripePaymentIntentId, pdfUrl, createdAt, paidAt)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL)
  `);
  stmt.run(invoice.id, invoice.clientId, invoice.amount, invoice.description, status, createdAt);
  return {
    id: invoice.id,
    clientId: invoice.clientId,
    amount: invoice.amount,
    description: invoice.description,
    status,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    pdfUrl: null,
    createdAt,
    paidAt: null,
  };
}

export function updateInvoiceStripeSession(id: string, sessionId: string): void {
  const stmt = db.prepare('UPDATE invoices SET stripeSessionId = ? WHERE id = ?');
  stmt.run(sessionId, id);
}

export function markInvoicePaid(id: string, paymentIntentId: string, pdfUrl: string): DbInvoice | null {
  const paidAt = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE invoices
    SET status = 'paid', stripePaymentIntentId = ?, pdfUrl = ?, paidAt = ?
    WHERE id = ?
  `);
  stmt.run(paymentIntentId, pdfUrl, paidAt, id);
  return getInvoiceById(id);
}

// Audit logging
export function logAuditEvent(log: Omit<DbAuditLog, 'id' | 'timestamp'>): void {
  try {
    const id = 'AUD-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const timestamp = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO security_audit_logs (id, timestamp, userId, userRole, action, resourceId, httpStatus, reason, ipAddress)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      timestamp,
      log.userId || null,
      log.userRole || null,
      log.action,
      log.resourceId || null,
      log.httpStatus,
      log.reason || null,
      log.ipAddress || null
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

export function getRecentAuditLogs(limit: number = 50): DbAuditLog[] {
  const stmt = db.prepare('SELECT * FROM security_audit_logs ORDER BY timestamp DESC LIMIT ?');
  return stmt.all(limit) as unknown as DbAuditLog[];
}

// Database Seeder
export function seedDatabaseIfEmpty(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount > 0) {
    return;
  }

  console.log('[Database] Seeding initial users and invoices for Nexus Corporate Services demo...');

  // Seed passwords
  const adminHash = bcrypt.hashSync('AdminPass123!', 10);
  const clientHash = bcrypt.hashSync('ClientPass123!', 10);

  // Admin user
  createUser({
    id: 'USR-ADMIN-01',
    name: 'Eleanor Vance (Admin)',
    email: 'admin@nexuscorporate.com',
    passwordHash: adminHash,
    role: 'admin',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  });

  // Client A
  createUser({
    id: 'USR-CLIENT-A',
    name: 'Acme Global Corporation',
    email: 'client.acme@nexus.com',
    passwordHash: clientHash,
    role: 'client',
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
  });

  // Client B
  createUser({
    id: 'USR-CLIENT-B',
    name: 'Globex Industries Inc.',
    email: 'client.globex@nexus.com',
    passwordHash: clientHash,
    role: 'client',
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
  });

  // Client C
  createUser({
    id: 'USR-CLIENT-C',
    name: 'Soylent Holdings Ltd.',
    email: 'client.soylent@nexus.com',
    passwordHash: clientHash,
    role: 'client',
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
  });

  // Seed Invoices for Client A
  createInvoice({
    id: 'INV-1001',
    clientId: 'USR-CLIENT-A',
    amount: 3450.0,
    description: 'Q3 Enterprise Architecture & Compliance Advisory',
    status: 'unpaid',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  });

  const paidA = createInvoice({
    id: 'INV-1002',
    clientId: 'USR-CLIENT-A',
    amount: 1800.0,
    description: 'Penetration Testing & Security Infrastructure Hardening',
    status: 'paid',
    createdAt: new Date(Date.now() - 18 * 86400000).toISOString(),
  });
  // Update paid metadata for INV-1002
  db.prepare(`
    UPDATE invoices
    SET paidAt = ?, stripePaymentIntentId = 'pi_seed_demo_acme_1002', pdfUrl = '/api/invoices/INV-1002/pdf'
    WHERE id = 'INV-1002'
  `).run(new Date(Date.now() - 17 * 86400000).toISOString());

  // Seed Invoices for Client B
  createInvoice({
    id: 'INV-2001',
    clientId: 'USR-CLIENT-B',
    amount: 7200.0,
    description: 'Global Cloud Infrastructure Migration & Multi-Region Setup',
    status: 'unpaid',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  });

  createInvoice({
    id: 'INV-2002',
    clientId: 'USR-CLIENT-B',
    amount: 950.0,
    description: 'Quarterly SOC-2 Type II Audit Preparation Package',
    status: 'paid',
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
  });
  db.prepare(`
    UPDATE invoices
    SET paidAt = ?, stripePaymentIntentId = 'pi_seed_demo_globex_2002', pdfUrl = '/api/invoices/INV-2002/pdf'
    WHERE id = 'INV-2002'
  `).run(new Date(Date.now() - 11 * 86400000).toISOString());

  // Seed Invoices for Client C
  createInvoice({
    id: 'INV-3001',
    clientId: 'USR-CLIENT-C',
    amount: 5100.0,
    description: 'Supply Chain Financial Risk & Regulatory Due Diligence',
    status: 'unpaid',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  });

  console.log('[Database] Seed completed successfully with demo users and invoices.');
}
