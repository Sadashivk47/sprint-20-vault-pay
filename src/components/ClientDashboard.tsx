import React, { useState, useEffect } from 'react';
import {
  FileText,
  CreditCard,
  Download,
  Clock,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Invoice } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface ClientDashboardProps {
  onSelectInvoice: (invoiceId: string) => void;
  onInitiatePayment: (invoiceId: string) => void;
  payingInvoiceId: string | null;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  onSelectInvoice,
  onInitiatePayment,
  payingInvoiceId,
}) => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getInvoices();
      setInvoices(res.invoices);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [user]);

  const totalOwed = invoices
    .filter((i) => i.status === 'unpaid')
    .reduce((sum, i) => sum + i.amount, 0);

  const totalSettled = invoices
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-6">
      {/* Client Welcome Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-2 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Zero-Trust Client Portal &bull; Scoped To Your Account
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{user?.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Registered Account: <span className="font-mono text-slate-700">{user?.email}</span> (ID: {user?.id})
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Due</div>
            <div className="text-xl font-bold text-amber-700">
              ${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-right px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Settled to Date</div>
            <div className="text-xl font-bold text-emerald-700">
              ${totalSettled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Your Invoices &amp; Retainers</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {invoices.length} {invoices.length === 1 ? 'Record' : 'Records'} on file
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="text-sm">Retrieving your invoices from secure ledger...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No invoices currently assigned to your account</p>
            <p className="text-xs text-slate-400 mt-1">Invoices issued by Nexus Corporate Services will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => {
              const isPaying = payingInvoiceId === inv.id;

              return (
                <div key={inv.id} className="p-6 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">{inv.id}</span>
                      {inv.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          PAID &bull; {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : 'Settled'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          PAYMENT DUE
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-slate-800">{inv.description}</h3>
                    <p className="text-xs text-slate-400">
                      Billed on {new Date(inv.createdAt).toLocaleDateString()} by Nexus Corporate Services
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Invoice Total</div>
                      <div className="text-xl font-bold text-slate-900">
                        ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectInvoice(inv.id)}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Details
                      </button>

                      {inv.status === 'unpaid' ? (
                        <button
                          onClick={() => onInitiatePayment(inv.id)}
                          disabled={isPaying}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Pay invoice via Stripe Checkout"
                        >
                          {isPaying ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Securing Session...</span>
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Pay with Stripe</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <a
                          href={api.getPdfUrl(inv.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer flex items-center gap-1.5"
                          title="Download official PDF receipt generated by pdfkit"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Receipt PDF</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
