import Stripe from 'stripe';
import { updateInvoiceStripeSession, DbInvoice } from '../db/database';

let stripeClient: Stripe | null = null;

export function hasLiveStripeKey(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return Boolean(key && !key.includes('MY_') && key !== 'sk_test_...' && key.startsWith('sk_live_'));
}

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || 'sk_test_vaultpay_cryptographic_verification_key';
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export async function createStripeCheckoutSession(
  invoice: DbInvoice,
  clientEmail: string,
  baseUrl: string
): Promise<{ url: string; sessionId: string; isMock: boolean }> {
  const stripe = getStripeClient();
  const key = process.env.STRIPE_SECRET_KEY;

  if (key && !key.includes('MY_') && key !== 'sk_test_...' && (key.startsWith('sk_test_') || key.startsWith('sk_live_'))) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: clientEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Invoice ${invoice.id}`,
                description: `${invoice.description} (Nexus Corporate Services)`,
              },
              unit_amount: Math.round(invoice.amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        client_reference_id: invoice.id,
        metadata: {
          invoiceId: invoice.id,
          clientId: invoice.clientId,
        },
        success_url: `${baseUrl}/invoices/${invoice.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/invoices/${invoice.id}?payment=cancelled`,
      });

      if (!session.url) {
        throw new Error('Stripe failed to return a checkout URL');
      }

      updateInvoiceStripeSession(invoice.id, session.id);
      return { url: session.url, sessionId: session.id, isMock: false };
    } catch (stripeErr) {
      console.warn('[Stripe] Live session creation failed, falling back to simulated session:', stripeErr);
    }
  }

  // Fallback for sandboxed demo environment when live Stripe credentials are not supplied
  const mockSessionId = `cs_test_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  updateInvoiceStripeSession(invoice.id, mockSessionId);

  return {
    url: `${baseUrl}/invoices/${invoice.id}?mock_stripe_checkout=ready&session_id=${mockSessionId}`,
    sessionId: mockSessionId,
    isMock: true,
  };
}
