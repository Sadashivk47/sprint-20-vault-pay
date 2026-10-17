import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  getAllInvoices,
  getInvoicesForClient,
  createInvoice,
  getAllClients,
  getUserById,
  getRecentAuditLogs,
  logAuditEvent,
} from '../db/database';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireInvoiceAccess } from '../middleware/ownership';
import { createStripeCheckoutSession } from '../services/stripe';
import { generateInvoicePdf, getReceiptPdfPath } from '../services/pdf';

const router = Router();

// GET /api/invoices
// Zero-trust list:
// - Admin role: returns all invoices across all clients
// - Client role: strictly filtered to WHERE clientId = req.user.id
router.get('/', requireAuth, (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.user.role === 'admin') {
    const invoices = getAllInvoices();
    res.json({ invoices, role: 'admin' });
    return;
  }

  // Client user: strictly own invoices
  const invoices = getInvoicesForClient(req.user.id);
  res.json({ invoices, role: 'client' });
});

// GET /api/invoices/:id
// Zero-trust detail:
// Guarded by requireInvoiceAccess middleware!
// Checks invoice.clientId === req.user.id unless req.user.role === 'admin'.
// Returns 403 if mismatched.
router.get('/:id', requireAuth, requireInvoiceAccess, (req: Request, res: Response): void => {
  // req.invoice is guaranteed to be attached and validated by requireInvoiceAccess
  const invoice = req.invoice!;
  const client = getUserById(invoice.clientId);

  res.json({
    invoice: {
      ...invoice,
      clientName: client ? client.name : 'Unknown Client',
      clientEmail: client ? client.email : '',
    },
  });
});

// POST /api/invoices
// Admin only: create invoice for a client
router.post('/', requireAuth, requireRole('admin'), (req: Request, res: Response): void => {
  const { clientId, amount, description } = req.body;

  if (!clientId || !amount || !description) {
    res.status(400).json({
      error: 'Missing required invoice parameters: clientId, amount, and description are required',
      code: 'MISSING_FIELDS',
    });
    return;
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    res.status(400).json({
      error: 'Invoice amount must be a positive number greater than 0',
      code: 'INVALID_AMOUNT',
    });
    return;
  }

  const client = getUserById(clientId);
  if (!client || client.role !== 'client') {
    res.status(400).json({
      error: 'Target clientId must reference an existing client account',
      code: 'INVALID_CLIENT',
    });
    return;
  }

  const newInvoiceId = 'INV-' + Math.floor(1000 + Math.random() * 9000);

  const invoice = createInvoice({
    id: newInvoiceId,
    clientId,
    amount: Math.round(numericAmount * 100) / 100,
    description: description.trim(),
    status: 'unpaid',
  });

  logAuditEvent({
    userId: req.user!.id,
    userRole: 'admin',
    action: 'INVOICE_CREATED',
    resourceId: invoice.id,
    httpStatus: 201,
    reason: `Admin created invoice ${invoice.id} for client ${clientId} with amount $${invoice.amount}`,
    ipAddress: req.ip || null,
  });

  res.status(201).json({
    message: 'Invoice created successfully',
    invoice: {
      ...invoice,
      clientName: client.name,
      clientEmail: client.email,
    },
  });
});

// POST /api/invoices/:id/checkout-session
// Initiates Stripe checkout session for an unpaid invoice.
// Guarded by requireInvoiceAccess: Client A cannot pay or initiate session for Client B!
router.post('/:id/checkout-session', requireAuth, requireInvoiceAccess, async (req: Request, res: Response): Promise<void> => {
  const invoice = req.invoice!;

  if (invoice.status === 'paid') {
    res.status(400).json({
      error: 'Invoice has already been paid and settled',
      code: 'ALREADY_PAID',
    });
    return;
  }

  const client = getUserById(invoice.clientId);
  if (!client) {
    res.status(404).json({ error: 'Client record not found' });
    return;
  }

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  const baseUrl = process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')
    ? process.env.APP_URL
    : `${protocol}://${host}`;

  try {
    const session = await createStripeCheckoutSession(invoice, client.email, baseUrl);

    logAuditEvent({
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'STRIPE_SESSION_CREATED',
      resourceId: invoice.id,
      httpStatus: 200,
      reason: `Stripe checkout session initialized: ${session.sessionId} (isMock: ${session.isMock})`,
      ipAddress: req.ip || null,
    });

    res.json({
      url: session.url,
      sessionId: session.sessionId,
      isMock: session.isMock,
    });
  } catch (error: unknown) {
    console.error('Checkout session creation failed:', error);
    res.status(500).json({
      error: 'Failed to initialize payment gateway checkout session',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/invoices/:id/pdf
// Downloads or views official PDF receipt.
// Guarded by requireInvoiceAccess: Client A cannot download Client B's receipt!
router.get('/:id/pdf', requireAuth, requireInvoiceAccess, async (req: Request, res: Response): Promise<void> => {
  const invoice = req.invoice!;

  if (invoice.status !== 'paid') {
    res.status(400).json({
      error: 'Official PDF receipt is only available once the invoice is verified as PAID by Stripe',
      code: 'INVOICE_NOT_PAID',
    });
    return;
  }

  const client = getUserById(invoice.clientId);
  if (!client) {
    res.status(404).json({ error: 'Client account not found' });
    return;
  }

  const pdfPath = getReceiptPdfPath(invoice.id);

  // Ensure PDF is generated if missing
  if (!fs.existsSync(pdfPath)) {
    try {
      await generateInvoicePdf(invoice, client);
    } catch (err) {
      console.error('Failed to generate PDF receipt on demand:', err);
      res.status(500).json({ error: 'Failed to generate PDF document' });
      return;
    }
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Receipt-${invoice.id}.pdf"`);

  const fileStream = fs.createReadStream(pdfPath);
  fileStream.pipe(res);
});

// GET /api/clients (Admin only)
router.get('/meta/clients', requireAuth, requireRole('admin'), (_req: Request, res: Response): void => {
  const clients = getAllClients();
  res.json({ clients });
});

// GET /api/audit-logs (Admin only)
router.get('/meta/audit-logs', requireAuth, requireRole('admin'), (_req: Request, res: Response): void => {
  const logs = getRecentAuditLogs(50);
  res.json({ logs });
});

export default router;
