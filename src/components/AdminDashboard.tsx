import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  CheckCircle2,
  Clock,
  Users,
  Plus,
  Search,
  Filter,
  Download,
  ExternalLink,
  FileText,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Invoice, User } from '../types';
import { api } from '../services/api';

interface AdminDashboardProps {
  onSelectInvoice: (invoiceId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onSelectInvoice }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Array<Pick<User, 'id' | 'name' | 'email'>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  // Create Invoice Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formClientId, setFormClientId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, clientRes] = await Promise.all([
        api.getInvoices(),
        api.getClients(),
      ]);
      setInvoices(invRes.invoices);
      setClients(clientRes.clients);
      if (clientRes.clients.length > 0 && !formClientId) {
        setFormClientId(clientRes.clients[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Metrics
  const metrics = useMemo(() => {
    const totalInvoiced = invoices.reduce((acc, curr) => acc + curr.amount, 0);
    const totalCollected = invoices
      .filter((i) => i.status === 'paid')
      .reduce((acc, curr) => acc + curr.amount, 0);
    const totalPending = invoices
      .filter((i) => i.status === 'unpaid')
      .reduce((acc, curr) => acc + curr.amount, 0);
    return {
      totalInvoiced,
      totalCollected,
      totalPending,
      totalCount: invoices.length,
      paidCount: invoices.filter((i) => i.status === 'paid').length,
    };
  }, [invoices]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      const matchesSearch =
        inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.clientName && inv.clientName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (inv.clientEmail && inv.clientEmail.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [invoices, statusFilter, searchQuery]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountNum = parseFloat(formAmount);
    if (!formClientId) {
      setFormError('Please select a client');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Please enter a valid amount greater than 0');
      return;
    }
    if (!formDescription.trim()) {
      setFormError('Please provide a service description');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createInvoice({
        clientId: formClientId,
        amount: amountNum,
        description: formDescription.trim(),
      });
      setModalOpen(false);
      setFormAmount('');
      setFormDescription('');
      // Reload invoices
      await loadData();
      onSelectInvoice(res.invoice.id);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Enterprise Invoicing Operations</h1>
          <p className="text-slate-500 text-sm">
            Administrative oversight for Nexus Corporate Services billing contracts &amp; settlements
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create New Invoice
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Billed</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">
              ${metrics.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{metrics.totalCount} total contracts issued</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Verified Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-emerald-700">
              ${metrics.totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{metrics.paidCount} settlements via Stripe Webhook</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Outstanding</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-amber-700">
              ${metrics.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Awaiting client payment</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Corporate Clients</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{clients.length} Accounts</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">B2B client organizations</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice ID, client, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              All ({invoices.length})
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                statusFilter === 'paid' ? 'bg-white text-emerald-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Paid ({metrics.paidCount})
            </button>
            <button
              onClick={() => setStatusFilter('unpaid')}
              className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                statusFilter === 'unpaid' ? 'bg-white text-amber-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Unpaid ({invoices.length - metrics.paidCount})
            </button>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="text-sm">Loading enterprise ledger...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No invoices match your query</p>
            <p className="text-xs text-slate-400 mt-1">Adjust filters or create a new invoice above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Invoice ID</th>
                  <th className="py-3.5 px-4">Client Organization</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                      {inv.id}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{inv.clientName}</div>
                      <div className="text-xs text-slate-500 font-mono">{inv.clientEmail}</div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs truncate text-slate-600" title={inv.description}>
                      {inv.description}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4">
                      {inv.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          PAID
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          UNPAID
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => onSelectInvoice(inv.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        title="View invoice details and settlement audit"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Details
                      </button>
                      {inv.status === 'paid' && (
                        <a
                          href={api.getPdfUrl(inv.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer border border-emerald-200"
                          title="Download PDF Receipt"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Invoice */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Issue Corporate Invoice</h2>
                <p className="text-xs text-slate-500">Authorized by Nexus Corporate Services Billing</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateInvoice} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Target Client Account *
                </label>
                <select
                  value={formClientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Invoice Amount (USD) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="2500.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    required
                    className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Service Deliverable / Description *
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Q3 SOC-2 Type II Compliance Advisory & Architecture Audit"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Generating...' : 'Create & Issue Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
