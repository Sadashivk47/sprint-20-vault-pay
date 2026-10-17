import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import {
  getInvoiceById,
  getInvoiceByStripeSessionId,
  getUserById,
  markInvoicePaid,
  logAuditEvent,
} from '../db/database';
import { getStripeClient } from '../services/stripe';
import { generateInvoicePdf } from '../services/pdf';
import { sendPaymentReceiptEmail } from '../services/email';

const router = Router();

/**
 * Handle payment completion workflow:
 * 1. Mark invoice status as 'paid' and record paidAt + paymentIntentId
 * 2. Generate PDF receipt using pdfkit
 * 3. Send automated email with PDF attachment via nodemailer
 */
export async function processPaidInvoice(
  invoiceId: string,
  paymentIntentId: string,
  source: 'stripe_webhook'
): Promise<{ success: boolean; error?: string }> {
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) {
    return { success: false, error: `Invoice '${invoiceId}' not found` };
  }

  if (invoice.status === 'paid') {
    return { success: true }; // Idempotent handling
  }

  const client = getUserById(invoice.clientId);
  if (!client) {
    return { success: false, error: `Client account '${invoice.clientId}' not found` };
  }

  const pdfUrl = `/api/invoices/${invoice.id}/pdf`;

  // Update DB as Paid
  const updatedInvoice = markInvoicePaid(invoice.id, paymentIntentId, pdfUrl);
  if (!updatedInvoice) {
    return { success: false, error: 'Database update failed' };
  }

  logAuditEvent({
    userId: client.id,
    userRole: 'client',
    action: 'INVOICE_PAID_CONFIRMED',
    resourceId: invoice.id,
    httpStatus: 200,
    reason: `Payment confirmed via ${source}. Marked invoice paid, payment intent: ${paymentIntentId}`,
    ipAddress: null,
  });

  // Generate official PDF receipt using pdfkit
  let pdfPath = '';
  try {
    pdfPath = await generateInvoicePdf(updatedInvoice, client);
    console.log(`[PDF Receipt] Successfully generated: ${pdfPath}`);
  } catch (pdfErr) {
    console.error(`[PDF Receipt] Failed to generate for invoice ${invoice.id}:`, pdfErr);
  }

  // Dispatch automated email with PDF attachment via nodemailer
  if (pdfPath) {
    try {
      await sendPaymentReceiptEmail(updatedInvoice, client, pdfPath);
      console.log(`[Email Notification] Receipt email dispatched for invoice ${invoice.id}`);
    } catch (emailErr) {
      console.error(`[Email Notification] Email dispatch failed:`, emailErr);
    }
  }

  return { success: true };
}

// POST /api/webhooks/stripe
// Verified Stripe Webhook Endpoint (Raw Body Required)
// Strictly enforces cryptographic signature verification via stripe.webhooks.constructEvent
router.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_vaultpay_webhook_secret_38f92a10';
  const stripe = getStripeClient();

  let event: Stripe.Event;

  // Strict signature check: sig header is mandatory
  if (!sig) {
    logAuditEvent({
      userId: null,
      userRole: null,
      action: 'WEBHOOK_SIGNATURE_MISSING',
      resourceId: '/api/webhooks/stripe',
      httpStatus: 400,
      reason: 'Missing stripe-signature header',
      ipAddress: req.ip || null,
    });
    res.status(400).send('Webhook Error: Missing stripe-signature header');
    return;
  }

  try {
    // req.body is a raw Buffer because express.raw is mounted on /api/webhooks/stripe
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Signature validation failed';
    logAuditEvent({
      userId: null,
      userRole: null,
      action: 'WEBHOOK_SIGNATURE_FAILED',
      resourceId: '/api/webhooks/stripe',
      httpStatus: 400,
      reason: `Stripe webhook signature verification failed: ${msg}`,
      ipAddress: req.ip || null,
    });
    res.status(400).send(`Webhook Error: ${msg}`);
    return;
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const sessionId = session.id;
    const paymentIntentId = (session.payment_intent as string) || `pi_stripe_${Date.now()}`;

    console.log(`[Stripe Webhook] Received authenticated checkout.session.completed for session: ${sessionId}`);

    // Look up invoice by session ID or client_reference_id
    let invoice = getInvoiceByStripeSessionId(sessionId);
    if (!invoice && session.client_reference_id) {
      invoice = getInvoiceById(session.client_reference_id);
    }
    if (!invoice && session.metadata?.invoiceId) {
      invoice = getInvoiceById(session.metadata.invoiceId);
    }

    if (!invoice) {
      console.warn(`[Stripe Webhook] No invoice found matching session ID: ${sessionId}`);
      res.status(404).json({ error: 'Invoice not found for session' });
      return;
    }

    const result = await processPaidInvoice(invoice.id, paymentIntentId, 'stripe_webhook');
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
  }

  res.json({ received: true, eventType: event.type });
});

export default router;
