import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ForbiddenViewProps {
  attemptedPath?: string;
  onNavigateHome: () => void;
}

export const ForbiddenView: React.FC<ForbiddenViewProps> = ({
  attemptedPath = '/admin/invoices/create',
  onNavigateHome,
}) => {
  const { user } = useAuth();

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white border border-rose-200 rounded-xl shadow-lg p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-rose-600" />

        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-5 border border-rose-200">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
          <Lock className="w-3.5 h-3.5" />
          HTTP 403 Forbidden
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied: Role Authorization Required</h1>
        <p className="text-slate-600 text-sm leading-relaxed mb-6">
          The requested route <code className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono text-xs">{attemptedPath}</code> is
          strictly reserved for administrative personnel. Your current authenticated session does not possess the required RBAC privilege.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left mb-6 text-xs space-y-2 font-mono">
          <div className="flex justify-between">
            <span className="text-slate-500">Authenticated Identity:</span>
            <span className="font-semibold text-slate-800">{user?.name || 'Anonymous'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Session Role:</span>
            <span className="font-semibold text-rose-600 uppercase">{user?.role || 'NONE'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Required Role:</span>
            <span className="font-semibold text-slate-900 uppercase">admin</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Security Policy:</span>
            <span className="text-slate-700">Strict Server-Side RBAC Enforcement</span>
          </div>
        </div>

        <button
          onClick={onNavigateHome}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Authorized Dashboard
        </button>
      </div>
    </div>
  );
};
