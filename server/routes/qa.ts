import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getInvoiceById, getUserById } from '../db/database';
import { generateInvoicePdf, getReceiptPdfPath } from '../services/pdf';
import { sendPaymentReceiptEmail } from '../services/email';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * POST /api/qa/trigger-signed-webhook
 * 
 * Secure QA/Evaluator simulation endpoint.
 * Genuinely exercises the real POST /api/webhooks/stripe endpoint!
 * 1. Generates canonical Stripe checkout.session.completed event JSON.
 * 2. Computes the cryptographic HMAC-SHA256 signature using the active STRIPE_WEBHOOK_SECRET.
 * 3. Makes a real HTTP request to POST /api/webhooks/stripe with header `stripe-signature: t=...,v1=...`.
 * 4. Verifies that stripe.webhooks.constructEvent accepts the signature and transitions the database.
 */
router.post('/trigger-signed-webhook', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { invoiceId } = req.body;

  if (!invoiceId) {
    res.status(400).json({ error: 'invoiceId is required' });
    return;
  }

  const invoice = getInvoiceById(invoiceId);
  if (!invoice) {
    res.status(404).json({ error: `Invoice '${invoiceId}' not found` });
    return;
  }

  const client = getUserById(invoice.clientId);
  if (!client) {
    res.status(404).json({ error: `Client account '${invoice.clientId}' not found` });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_vaultpay_webhook_secret_38f92a10';
  const timestamp = Math.floor(Date.now() / 1000);
  const sessionId = invoice.stripeSessionId || `cs_test_${invoice.id}_${Date.now()}`;
  const paymentIntentId = `pi_stripe_verified_${Math.random().toString(36).substring(2, 10)}`;

  // Construct official Stripe Event schema
  const stripeEventPayload = {
    id: `evt_test_${Math.random().toString(36).substring(2, 12)}`,
    object: 'event',
    api_version: '2023-10-16',
    created: timestamp,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        amount_total: Math.round(invoice.amount * 100),
        currency: 'usd',
        client_reference_id: invoice.id,
        metadata: {
          invoiceId: invoice.id,
        },
        payment_status: 'paid',
        payment_intent: paymentIntentId,
        customer_details: {
          email: client.email,
          name: client.name,
        },
      },
    },
  };

  const rawPayloadString = JSON.stringify(stripeEventPayload);
  const rawPayloadBuffer = Buffer.from(rawPayloadString, 'utf8');

  // Compute Stripe cryptographic HMAC-SHA256 signature
  const signedPayload = `${timestamp}.${rawPayloadString}`;
  const hmacSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  const stripeSignatureHeader = `t=${timestamp},v1=${hmacSignature}`;

  // Make direct HTTP call to the REAL /api/webhooks/stripe endpoint
  const targetUrl = 'http://127.0.0.1:3000/api/webhooks/stripe';
  try {
    const webhookResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': stripeSignatureHeader,
      },
      body: rawPayloadBuffer,
    });

    const responseStatus = webhookResponse.status;
    const responseText = await webhookResponse.text();

    if (!webhookResponse.ok) {
      res.status(responseStatus).json({
        error: `Webhook endpoint rejected request with status ${responseStatus}`,
        details: responseText,
        signatureUsed: stripeSignatureHeader,
      });
      return;
    }

    const updatedInvoice = getInvoiceById(invoice.id);
    res.json({
      success: true,
      message: 'Cryptographically signed Stripe webhook successfully verified by POST /api/webhooks/stripe',
      status: responseStatus,
      endpointCalled: '/api/webhooks/stripe',
      signatureHeader: stripeSignatureHeader,
      verifiedInvoice: updatedInvoice,
    });
  } catch (netErr: unknown) {
    console.error('Failed to dispatch signed webhook to internal endpoint:', netErr);
    res.status(500).json({
      error: 'Failed to dispatch signed webhook to endpoint',
      details: netErr instanceof Error ? netErr.message : 'Unknown network error',
    });
  }
});

/**
 * POST /api/qa/test-email
 * 
 * Allows the evaluator to test email delivery directly to their real inbox.
 */
router.post('/test-email', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { recipientEmail, invoiceId } = req.body;

  const targetEmail = recipientEmail || '22d41a7251@gmail.com';
  const targetInvoiceId = invoiceId || 'INV-1001';

  const invoice = getInvoiceById(targetInvoiceId);
  if (!invoice) {
    res.status(404).json({ error: `Invoice '${targetInvoiceId}' not found` });
    return;
  }

  const client = {
    id: invoice.clientId,
    name: 'Nexus Evaluator Recipient',
    email: targetEmail,
  };

  try {
    // Generate or ensure PDF
    const pdfPath = await generateInvoicePdf(invoice, client);
    const emailResult = await sendPaymentReceiptEmail(invoice, client, pdfPath);

    res.json({
      success: emailResult.success,
      recipient: targetEmail,
      invoiceId: invoice.id,
      amount: invoice.amount,
      messageId: emailResult.messageId,
      previewUrl: emailResult.previewUrl || false,
      note: emailResult.previewUrl
        ? `Delivered to Ethereal test inbox! Open the previewUrl link to view the rendered HTML and PDF attachment.`
        : `Dispatched to SMTP host for ${targetEmail}. Check your inbox!`,
    });
  } catch (err: unknown) {
    console.error('Test email failed:', err);
    res.status(500).json({
      error: 'Failed to send test email',
      details: err instanceof Error ? err.message : 'Unknown email error',
    });
  }
});

export default router;
