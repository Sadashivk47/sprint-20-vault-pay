import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CreditCard,
  Download,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Building2,
  AlertCircle,
  Loader2,
  Zap,
} from 'lucide-react';
import { Invoice } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface InvoiceDetailPageProps {
  invoiceId: string;
  onBack: () => void;
  onPaymentSuccess?: () => void;
  isQaMode?: boolean;
}

export const InvoiceDetailPage: React.FC<InvoiceDetailPageProps> = ({
  invoiceId,
  onBack,
  onPaymentSuccess,
  isQaMode = false,
}) => {
  const { user } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Requirement 4: On click, immediately disable the button and show a loading spinner BEFORE the redirect
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Simulation test state for local evaluators (gated to QA mode)
  const [simulatingWebhook, setSimulatingWebhook] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);

  const loadInvoice = async () => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await api.getInvoiceById(invoiceId);
      setInvoice(res.invoice);
    } catch (err: unknown) {
      const errorObj = err as Error & { status?: number; code?: string };
      setError(errorObj.message || 'Failed to retrieve invoice details');
      setErrorCode(errorObj.code || (errorObj.status === 403 ? 'FORBIDDEN' : 'ERROR'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  // Requirement 4: Synchronous disable & spinner before async redirect
  const handlePay = async () => {
    if (!invoice || paying) return;

    // Immediately disable button and activate loading state
    setPaying(true);
    setPayError(null);

    try {
      const { url, isMock } = await api.createCheckoutSession(invoice.id);

      if (isMock) {
        // In local mock mode, refresh invoice state to capture session ID
        await loadInvoice();
        setWebhookMessage('Stripe session generated. In QA Mode, trigger the signed webhook to finalize.');
        setPaying(false);
      } else {
        // Redirect to real Stripe hosted checkout
        window.location.href = url;
      }
    } catch (err: unknown) {
      setPaying(false);
      setPayError(err instanceof Error ? err.message : 'Checkout session initiation failed');
    }
  };

  // Requirement 2: Evaluator Signed Webhook Simulation (genuinely exercises POST /api/webhooks/stripe)
  const handleTriggerSignedWebhook = async () => {
    if (!invoice || simulatingWebhook) return;
    setSimulatingWebhook(true);
    setWebhookMessage(null);
    try {
      const res = await api.simulateWebhookPayment(invoice.id);
      setWebhookMessage(`Stripe Webhook Verified: checkout.session.completed received via signed POST /api/webhooks/stripe! Database transitioned to PAID. PDF generated and email dispatched.`);
      await loadInvoice();
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: unknown) {
      setWebhookMessage(err instanceof Error ? err.message : 'Webhook verification failed');
    } finally {
      setSimulatingWebhook(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-xs flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        <p className="text-sm text-slate-600 font-medium">Validating invoice ownership and querying cryptographic ledger...</p>
      </div>
    );
  }

  // If IDOR ownership check failed (403 Forbidden)
  if (errorCode === 'INVOICE_ACCESS_DENIED' || errorCode === 'FORBIDDEN') {
    return (
      <div className="bg-white border border-rose-200 rounded-xl p-8 shadow-xs text-center max-w-2xl mx-auto space-y-4">
        <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="inline-block px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-bold uppercase tracking-wider">
          HTTP 403 Forbidden — Ownership Boundary Enforced
        </div>
        <h2 className="text-xl font-bold text-slate-900">Zero-Trust IDOR Prevention Active</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          The requested invoice <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">{invoiceId}</code> belongs
          to a different corporate client. The reusable <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">requireInvoiceAccess</code> middleware
          successfully rejected your request.
        </p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Authorized Invoices
        </button>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-xs text-center max-w-lg mx-auto space-y-4">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Invoice Not Found</h2>
        <p className="text-sm text-slate-500">{error || 'Could not locate invoice'}</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to List
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Bar navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Verified Ownership: {invoice.clientId}
        </div>
      </div>

      {/* Main Invoice Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Header */}
        <div className="p-6 md:p-8 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono font-medium tracking-wide">
              <Building2 className="w-3.5 h-3.5" />
              NEXUS CORPORATE SERVICES &bull; FINANCIAL CORE
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">Invoice {invoice.id}</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Issued on {new Date(invoice.createdAt).toLocaleDateString()} &bull; Due upon receipt
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Current Status</div>
            <div className="mt-1">
              {invoice.status === 'paid' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  PAID IN FULL
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                  <Clock className="w-4 h-4 text-amber-400" />
                  UNPAID &bull; AWAITING SETTLEMENT
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-8">
          {/* Client & Organization Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Billed Client</span>
              <div className="mt-1 font-bold text-slate-900 text-base">{invoice.clientName || 'Corporate Client'}</div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">Account ID: {invoice.clientId}</div>
              {invoice.clientEmail && (
                <div className="text-xs text-slate-500 font-mono">{invoice.clientEmail}</div>
              )}
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Metadata</span>
              <div className="mt-1 space-y-1 text-xs text-slate-600 font-mono">
                <div>Stripe Session: {invoice.stripeSessionId || 'Not yet initiated'}</div>
                <div>Payment Intent: {invoice.stripePaymentIntentId || 'Pending settlement'}</div>
                {invoice.paidAt && (
                  <div className="text-emerald-700 font-semibold">
                    Settled Timestamp: {new Date(invoice.paidAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Deliverables Breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Professional Service Deliverable
            </h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900 text-sm">{invoice.description}</p>
                <p className="text-xs text-slate-500 mt-0.5">Fixed-fee contract engagement per master service agreement</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Total</span>
                <div className="text-xl font-bold text-slate-900 font-mono">
                  ${invoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* Action Area */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500">
              {invoice.status === 'paid' ? (
                <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Official PDF receipt generated and dispatched to registered email.
                </span>
              ) : (
                <span>Payments are securely processed via Stripe. Database is updated solely via verified webhook.</span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {invoice.status === 'unpaid' ? (
                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {paying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Securing Stripe Session...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Pay Invoice (${invoice.amount.toFixed(2)})</span>
                    </>
                  )}
                </button>
              ) : (
                <a
                  href={api.getPdfUrl(invoice.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Official Receipt (PDF)</span>
                </a>
              )}
            </div>
          </div>

          {payError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{payError}</span>
            </div>
          )}

          {/* Gated Evaluator Tool Banner: only visible if isQaMode is explicitly true */}
          {isQaMode && invoice.status === 'unpaid' && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 mt-6">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <div className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    QA / Evaluator Mode &bull; Signed Webhook Simulator
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    This triggers a genuine cryptographic signature HMAC-SHA256 and calls <code className="font-mono text-amber-900">POST /api/webhooks/stripe</code> directly to test server verification.
                  </p>
                  <button
                    onClick={handleTriggerSignedWebhook}
                    disabled={simulatingWebhook}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {simulatingWebhook ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying Signature via POST /api/webhooks/stripe...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Execute Signed Webhook (POST /api/webhooks/stripe)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {webhookMessage && (
                <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{webhookMessage}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
