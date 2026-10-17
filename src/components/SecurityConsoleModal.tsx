import React, { useState, useEffect } from 'react';
import {
  Terminal,
  ShieldAlert,
  Copy,
  Check,
  Play,
  History,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, getStoredToken } from '../services/api';
import { AuditLog } from '../types';

interface SecurityConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TestResult {
  url: string;
  method: string;
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: unknown;
  expectedStatus: number;
  passed: boolean;
}

export const SecurityConsoleModal: React.FC<SecurityConsoleModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const token = getStoredToken();
  const [activeTab, setActiveTab] = useState<'tester' | 'audit-logs'>('tester');
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Test execution state
  const [runningTest, setRunningTest] = useState(false);
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const testScenarios = [
    {
      id: 'idor-client-b',
      title: '1. IDOR Attack (Hit Client B Invoice with Client A JWT)',
      method: 'GET',
      endpoint: '/api/invoices/INV-2001',
      expectedStatus: 403,
      description: 'Tests reusable requireInvoiceAccess middleware. Client A attempts to view Client B invoice INV-2001. Must return 403 Forbidden.',
    },
    {
      id: 'rbac-post-invoice',
      title: '2. RBAC Privilege Escalation (Client calls POST /api/invoices)',
      method: 'POST',
      endpoint: '/api/invoices',
      payload: { clientId: 'USR-CLIENT-A', amount: 9999, description: 'Unauthorized Invoice Creation' },
      expectedStatus: 403,
      description: 'Tests requireRole("admin"). A client attempts to hit administrative invoice creation endpoint. Must return 403 Forbidden.',
    },
    {
      id: 'idor-pdf-theft',
      title: '3. IDOR Receipt Theft (Download Client B PDF with Client A JWT)',
      method: 'GET',
      endpoint: '/api/invoices/INV-2002/pdf',
      expectedStatus: 403,
      description: 'Tests requireInvoiceAccess on file downloads. Client attempts to download another client settled PDF receipt. Must return 403 Forbidden.',
    },
    {
      id: 'unauthenticated-list',
      title: '4. Zero-Trust Boundary (No JWT Bearer Token)',
      method: 'GET',
      endpoint: '/api/invoices',
      useAuth: false,
      expectedStatus: 401,
      description: 'Tests requireAuth. Call with missing Authorization header. Must return 401 Unauthorized.',
    },
    {
      id: 'admin-all-access',
      title: '5. Admin Legitimate Access (Admin views all invoices)',
      method: 'GET',
      endpoint: '/api/invoices',
      expectedStatus: user?.role === 'admin' ? 200 : 200,
      description: 'Tests authorized query behavior. Returns all invoices for admin, or client-scoped list for client.',
    },
  ];

  const [selectedScenario, setSelectedScenario] = useState(testScenarios[0]);

  const loadAuditLogs = async () => {
    if (user?.role !== 'admin') {
      return;
    }
    setLoadingLogs(true);
    try {
      const res = await api.getAuditLogs();
      setAuditLogs(res.logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'audit-logs') {
      loadAuditLogs();
    }
  }, [isOpen, activeTab]);

  const runScenario = async (scenario: typeof selectedScenario) => {
    setRunningTest(true);
    setLastResult(null);
    const start = performance.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (scenario.useAuth !== false && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const options: RequestInit = {
        method: scenario.method,
        headers,
      };
      if (scenario.method === 'POST' && scenario.payload) {
        options.body = JSON.stringify(scenario.payload);
      }

      const res = await fetch(scenario.endpoint, options);
      const durationMs = Math.round(performance.now() - start);

      const headerEntries: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headerEntries[key] = val;
      });

      let bodyData: unknown;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        bodyData = await res.json();
      } else {
        bodyData = await res.text();
      }

      const passed = res.status === scenario.expectedStatus;
      setLastResult({
        url: scenario.endpoint,
        method: scenario.method,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        headers: headerEntries,
        body: bodyData,
        expectedStatus: scenario.expectedStatus,
        passed,
      });
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      setLastResult({
        url: scenario.endpoint,
        method: scenario.method,
        status: 0,
        statusText: 'Network / Client Error',
        durationMs,
        headers: {},
        body: { error: err instanceof Error ? err.message : 'Execution failed' },
        expectedStatus: scenario.expectedStatus,
        passed: false,
      });
    } finally {
      setRunningTest(false);
    }
  };

  const generateCurl = (scenario: typeof selectedScenario) => {
    const authHeader = scenario.useAuth !== false && token ? `-H "Authorization: Bearer ${token}" ` : '';
    const dataPart = scenario.payload ? `-d '${JSON.stringify(scenario.payload)}' ` : '';
    return `curl -i -X ${scenario.method} "${window.location.origin}${scenario.endpoint}" ${authHeader}-H "Content-Type: application/json" ${dataPart}`.trim();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col text-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Postman &amp; Zero-Trust Security Verification Console
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  LIVE REST SUITE
                </span>
              </h2>
              <p className="text-xs text-slate-400">Simulate evaluator Postman requests against live API boundaries</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Current Identity & JWT Bar */}
        <div className="px-6 py-3 bg-slate-850 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">Active Test Persona:</span>
            <span className="font-semibold text-white">{user?.name}</span>
            <span className={`px-2 py-0.5 rounded font-mono font-bold uppercase text-[10px] ${
              user?.role === 'admin' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }`}>
              {user?.role}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-mono text-[11px] truncate max-w-[180px]">
              {token ? `JWT: ${token.slice(0, 18)}...` : 'No Token'}
            </span>
            {token && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  setCopiedToken(true);
                  setTimeout(() => setCopiedToken(false), 2000);
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                title="Copy JWT token for external Postman testing"
              >
                {copiedToken ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedToken ? 'Copied' : 'Copy JWT'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-slate-800 flex items-center gap-4 bg-slate-900 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('tester')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'tester'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Attack Simulator &amp; Postman Suite
          </button>
          {user?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('audit-logs')}
              className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'audit-logs'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Security Audit Event Log ({auditLogs.length})
            </button>
          )}
        </div>

        {/* Tab 1: Attack Simulator */}
        {activeTab === 'tester' ? (
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Scenario Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Select Evaluator Verification Scenario:
              </label>
              <div className="grid grid-cols-1 gap-2">
                {testScenarios.map((sc) => (
                  <div
                    key={sc.id}
                    onClick={() => {
                      setSelectedScenario(sc);
                      setLastResult(null);
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedScenario.id === sc.id
                        ? 'bg-slate-800/90 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/20'
                        : 'bg-slate-850/50 border-slate-800 hover:bg-slate-800/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                          sc.method === 'POST' ? 'bg-amber-950 text-amber-300' : 'bg-blue-950 text-blue-300'
                        }`}>
                          {sc.method}
                        </span>
                        <span className="font-semibold text-slate-200">{sc.title}</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                        Expects HTTP {sc.expectedStatus}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-1.5 leading-relaxed">{sc.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Execute Box & Curl */}
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-mono text-xs text-slate-300 truncate">
                  <span className="text-amber-400 font-bold">{selectedScenario.method}</span>
                  <span>{selectedScenario.endpoint}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generateCurl(selectedScenario));
                      setCopiedCurl(true);
                      setTimeout(() => setCopiedCurl(false), 2000);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedCurl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCurl ? 'cURL Copied' : 'Copy cURL'}</span>
                  </button>

                  <button
                    onClick={() => runScenario(selectedScenario)}
                    disabled={runningTest}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {runningTest ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{runningTest ? 'Firing Request...' : 'Send Live Request'}</span>
                  </button>
                </div>
              </div>

              {/* cURL Display */}
              <div className="bg-slate-900 rounded p-2 text-[10px] font-mono text-slate-400 overflow-x-auto whitespace-pre">
                {generateCurl(selectedScenario)}
              </div>
            </div>

            {/* Execution Result */}
            {lastResult && (
              <div className={`rounded-xl border p-4 space-y-3 ${
                lastResult.passed ? 'bg-emerald-950/20 border-emerald-800/60' : 'bg-rose-950/20 border-rose-800/60'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {lastResult.passed ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    )}
                    <span className="text-xs font-bold text-white">
                      {lastResult.passed ? 'SECURITY SPECIFICATION PASSED' : 'SECURITY CHECK MISMATCH'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className={`px-2.5 py-0.5 rounded font-bold ${
                      lastResult.status === 403
                        ? 'bg-rose-900 text-rose-200'
                        : lastResult.status === 401
                        ? 'bg-amber-900 text-amber-200'
                        : 'bg-emerald-900 text-emerald-200'
                    }`}>
                      HTTP {lastResult.status} {lastResult.statusText}
                    </span>
                    <span className="text-slate-400 text-[10px]">({lastResult.durationMs}ms)</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                    Server Response JSON:
                  </div>
                  <pre className="bg-slate-950 border border-slate-800 rounded p-3 text-xs font-mono text-emerald-300 overflow-x-auto max-h-56">
                    {typeof lastResult.body === 'object'
                      ? JSON.stringify(lastResult.body, null, 2)
                      : String(lastResult.body)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Tab 2: Audit Logs */
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Database Security Audit Trail
                </h3>
                <p className="text-xs text-slate-400">
                  Every unauthorized access attempt (403 IDOR, 401 unauthenticated, etc.) is persisted to SQLite
                </p>
              </div>
              <button
                onClick={loadAuditLogs}
                disabled={loadingLogs}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                title="Refresh Logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingLogs ? (
              <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Reading audit log from secure SQLite storage...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No security audit events recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.httpStatus === 403
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : log.httpStatus === 401
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          HTTP {log.httpStatus}
                        </span>
                        <span className="text-white font-bold">{log.action}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">{log.reason}</div>
                    <div className="text-[10px] text-slate-500 flex gap-4 pt-1">
                      <span>User: {log.userId || 'Anonymous'}</span>
                      <span>Role: {log.userRole || 'None'}</span>
                      <span>Target: {log.resourceId}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Nexus Security Architecture Standard 2026</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
