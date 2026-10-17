import React, { useState } from 'react';
import {
  Terminal,
  ShieldCheck,
  Zap,
  Mail,
  Users,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

interface EvaluatorToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSecurityConsole: () => void;
  onNavigateToAdminRoute: () => void;
  activeInvoiceId?: string | null;
  onInvoiceUpdated?: () => void;
}

export const EvaluatorToolsDrawer: React.FC<EvaluatorToolsDrawerProps> = ({
  isOpen,
  onClose,
  onOpenSecurityConsole,
  onNavigateToAdminRoute,
  activeInvoiceId,
  onInvoiceUpdated,
}) => {
  const { user, quickSwitch } = useAuth();
  const [switchingUser, setSwitchingUser] = useState<string | null>(null);

  // Signed Webhook trigger state
  const [webhookInvoiceId, setWebhookInvoiceId] = useState(activeInvoiceId || 'INV-1001');
  const [triggeringWebhook, setTriggeringWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ message?: string; signature?: string; error?: string } | null>(null);

  // Email test state
  const [recipientEmail, setRecipientEmail] = useState('22d41a7251@gmail.com');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState<{ previewUrl?: string | false; messageId?: string; note?: string; error?: string } | null>(null);

  if (!isOpen) return null;

  const demoAccounts = [
    { role: 'admin', label: 'Admin (Eleanor Vance)', email: 'admin@nexuscorporate.com', pass: 'AdminPass123!' },
    { role: 'client', label: 'Client A (Acme Global)', email: 'client.acme@nexus.com', pass: 'ClientPass123!' },
    { role: 'client', label: 'Client B (Globex Corp)', email: 'client.globex@nexus.com', pass: 'ClientPass123!' },
    { role: 'client', label: 'Client C (Soylent Ltd)', email: 'client.soylent@nexus.com', pass: 'ClientPass123!' },
  ];

  const handleSwitch = async (email: string, pass: string) => {
    setSwitchingUser(email);
    try {
      await quickSwitch(email, pass);
    } finally {
      setSwitchingUser(null);
    }
  };

  const handleTriggerSignedWebhook = async () => {
    setTriggeringWebhook(true);
    setWebhookResult(null);
    try {
      const res = await api.simulateWebhookPayment(webhookInvoiceId);
      setWebhookResult({
        message: res.message,
        signature: res.signatureHeader,
      });
      if (onInvoiceUpdated) onInvoiceUpdated();
    } catch (err: unknown) {
      setWebhookResult({
        error: err instanceof Error ? err.message : 'Webhook dispatch rejected',
      });
    } finally {
      setTriggeringWebhook(false);
    }
  };

  const handleSendTestEmail = async () => {
    setSendingEmail(true);
    setEmailResult(null);
    try {
      const res = await api.testEmailReceipt(recipientEmail, webhookInvoiceId);
      setEmailResult({
        messageId: res.messageId,
        previewUrl: res.previewUrl,
        note: res.note,
      });
    } catch (err: unknown) {
      setEmailResult({
        error: err instanceof Error ? err.message : 'Email dispatch failed',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <aside aria-label="QA and Evaluator Tools" className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t-2 border-emerald-500 shadow-2xl text-slate-100 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
      {/* Top Bar of Drawer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono text-xs font-bold">
            QA
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-tight text-white flex items-center gap-2">
              Evaluator &amp; Security Audit Suite
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                ISOLATED FROM CLIENT CHROME
              </span>
            </h3>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs flex items-center gap-1"
        >
          <span>Hide QA Bar</span>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grid of Tools */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        {/* Tool 1: Real Auth Role Switcher */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-200">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>1. Auth Persona Switcher</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Hits real <code className="text-emerald-300 font-mono">/api/auth/login</code> via bcrypt + JWT sign.
          </p>
          <div className="space-y-1 pt-1">
            {demoAccounts.map((acc) => (
              <button
                key={acc.email}
                onClick={() => handleSwitch(acc.email, acc.pass)}
                disabled={switchingUser === acc.email}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[11px] transition-all flex items-center justify-between cursor-pointer ${
                  user?.email === acc.email
                    ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200 font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                }`}
              >
                <span>{acc.label}</span>
                {switchingUser === acc.email ? (
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                ) : (
                  <span className="text-[9px] font-mono uppercase text-slate-500">{acc.role}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tool 2: Test /admin Guard & Postman Suite */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>2. Security &amp; RBAC Audits</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight mt-1">
              Verify IDOR prevention, missing token rejection, and route guards.
            </p>
          </div>

          <div className="space-y-1.5 pt-2">
            <button
              onClick={onNavigateToAdminRoute}
              className="w-full py-1.5 px-2.5 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              title="Tests client route guard redirecting to /403"
            >
              <span>Test /admin Route Guard (403)</span>
            </button>

            <button
              onClick={onOpenSecurityConsole}
              className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-750 text-emerald-300 border border-emerald-700/40 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Postman Simulator</span>
            </button>
          </div>
        </div>

        {/* Tool 3: Genuine Signed Webhook Trigger */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-200">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>3. Signed Webhook Settlement</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Dispatches HMAC-SHA256 signed payload to real <code className="text-amber-300 font-mono">POST /api/webhooks/stripe</code>.
          </p>
          <div className="space-y-1.5 pt-1">
            <input
              type="text"
              value={webhookInvoiceId}
              onChange={(e) => setWebhookInvoiceId(e.target.value)}
              placeholder="e.g. INV-1001"
              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-200 text-[11px] font-mono"
            />
            <button
              onClick={handleTriggerSignedWebhook}
              disabled={triggeringWebhook}
              className="w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg text-[11px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {triggeringWebhook ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              <span>Execute Signed Webhook</span>
            </button>
            {webhookResult?.message && (
              <div className="p-1.5 bg-emerald-950/40 border border-emerald-800/60 rounded text-[10px] text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{webhookResult.message}</span>
              </div>
            )}
            {webhookResult?.error && (
              <div className="p-1.5 bg-rose-950/40 border border-rose-800/60 rounded text-[10px] text-rose-300 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="truncate">{webhookResult.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tool 4: Real Email Test */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-200">
            <Mail className="w-3.5 h-3.5 text-indigo-400" />
            <span>4. Test Real Email Receipt</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Sends real PDF receipt via nodemailer to verify inbox delivery.
          </p>
          <div className="space-y-1.5 pt-1">
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Your email (e.g. 22d41a7251@gmail.com)"
              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-200 text-[11px]"
            />
            <button
              onClick={handleSendTestEmail}
              disabled={sendingEmail}
              className="w-full py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-[11px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {sendingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              <span>Send PDF Receipt Email</span>
            </button>
            {emailResult?.previewUrl && (
              <div className="p-1.5 bg-indigo-950/40 border border-indigo-800/60 rounded text-[10px] text-indigo-300 flex items-center justify-between">
                <span>Ethereal Delivered!</span>
                <a
                  href={emailResult.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-indigo-200 font-semibold flex items-center gap-0.5"
                >
                  View Inbox <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}
            {emailResult?.note && !emailResult.previewUrl && (
              <div className="p-1.5 bg-emerald-950/40 border border-emerald-800/60 rounded text-[10px] text-emerald-300">
                {emailResult.note}
              </div>
            )}
            {emailResult?.error && (
              <div className="p-1.5 bg-rose-950/40 border border-rose-800/60 rounded text-[10px] text-rose-300 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                <span>{emailResult.error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
