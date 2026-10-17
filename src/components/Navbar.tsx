import React from 'react';
import { ShieldCheck, Building2, User as UserIcon, LogOut, Wrench } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  onToggleEvaluatorTools: () => void;
  isEvaluatorToolsOpen: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleEvaluatorTools,
  isEvaluatorToolsOpen,
}) => {
  const { user, logout } = useAuth();

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Organization */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">VaultPay</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Financial Core
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-500" />
              Nexus Corporate Services
            </div>
          </div>
        </div>

        {/* Primary Client Chrome */}
        <div className="flex items-center gap-4">
          {/* User & Role Badge */}
          <div className="flex items-center gap-2.5 pl-3 border-l border-slate-800 text-xs">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="leading-tight text-left">
              <div className="font-semibold text-slate-200 truncate max-w-[160px]">{user?.name}</div>
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                {user?.role === 'admin' ? (
                  <span className="text-amber-400 font-bold">Administrator</span>
                ) : (
                  <span className="text-emerald-400 font-bold">Corporate Client</span>
                )}
              </div>
            </div>
          </div>

          {/* Discreet QA / Evaluator Tools Toggle */}
          <button
            onClick={onToggleEvaluatorTools}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              isEvaluatorToolsOpen
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700/80'
            }`}
            title="Toggle QA and Evaluator Tools drawer"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">QA Tools</span>
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Sign Out of Session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
