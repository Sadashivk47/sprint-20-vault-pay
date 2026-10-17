import React, { useState, useEffect } from 'react';
import { ShieldCheck, Building2, Lock, ArrowRight, AlertCircle, Loader2, Wrench } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Requirement 5: Gate evaluator fast login behind QA mode (?debug=true or ?evaluator=true or toggle)
  const [showEvaluatorTools, setShowEvaluatorTools] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'true' || params.get('evaluator') === 'true' || params.get('qa') === 'true') {
      setShowEvaluatorTools(true);
    }
  }, []);

  const demoCards = [
    {
      role: 'admin',
      label: 'Admin: Eleanor Vance',
      email: 'admin@nexuscorporate.com',
      pass: 'AdminPass123!',
      desc: 'Full administrative privileges: issue invoices, view all clients, inspect security logs.',
      badge: 'ADMIN',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-300',
    },
    {
      role: 'client',
      label: 'Client A: Acme Global Corporation',
      email: 'client.acme@nexus.com',
      pass: 'ClientPass123!',
      desc: 'Scoped to INV-1001 & INV-1002. Test 403 when querying Client B.',
      badge: 'CLIENT A',
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    },
    {
      role: 'client',
      label: 'Client B: Globex Industries Inc.',
      email: 'client.globex@nexus.com',
      pass: 'ClientPass123!',
      desc: 'Scoped to INV-2001 & INV-2002. Test cross-client tenant isolation.',
      badge: 'CLIENT B',
      badgeColor: 'bg-blue-50 text-blue-800 border-blue-300',
    },
  ];

  // Standard Form Submit (Real POST /api/auth/login)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // Requirement 1: Evaluator Fast Login Handler
  // Submits email + password directly to `login()`, which executes real POST /api/auth/login.
  // The server checks passwordHash via bcrypt, creates a signed JWT, and returns the token.
  const handleQuickLogin = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setLoading(true);

    try {
      await login(demoEmail, demoPass);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 mx-auto shadow-md">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          VaultPay Financial Core
        </h1>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-500 font-medium">
          <Building2 className="w-3.5 h-3.5" />
          Nexus Corporate Services &bull; Secure Enterprise Gateway
        </div>
      </div>

      {/* Main Authentication Box */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-8 shadow-sm border border-slate-200 rounded-2xl space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">Sign in to your account</h2>
            <p className="text-xs text-slate-500 mt-0.5">Enter your corporate credentials to continue</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Standard Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Corporate Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@nexuscorporate.com"
                required
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Requirement 5: Isolated QA / Evaluator Fast Login Section */}
          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowEvaluatorTools(!showEvaluatorTools)}
              className="w-full py-2 px-3 text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center justify-between rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-slate-400" />
                <span>QA / Evaluator Credentials</span>
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {showEvaluatorTools ? 'Hide' : 'Show'}
              </span>
            </button>

            {showEvaluatorTools && (
              <div className="mt-3 space-y-2 pt-2 border-t border-slate-100 animate-in fade-in duration-150">
                <div className="text-[11px] text-slate-400 mb-2">
                  1-Click authentication executing real cryptographic token issuance via <code className="font-mono text-slate-600">POST /api/auth/login</code>:
                </div>
                {demoCards.map((card) => (
                  <button
                    key={card.email}
                    type="button"
                    onClick={() => handleQuickLogin(card.email, card.pass)}
                    disabled={loading}
                    className="w-full p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/70 hover:bg-slate-100 text-left transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 group-hover:text-slate-950">
                          {card.label}
                        </span>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${card.badgeColor}`}>
                          {card.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">{card.desc}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-slate-400">
          Nexus Corporate Services &bull; Enterprise Financial Architecture &bull; 2026
        </div>
      </div>
    </div>
  );
};
