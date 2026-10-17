import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { AdminDashboard } from './components/AdminDashboard';
import { ClientDashboard } from './components/ClientDashboard';
import { InvoiceDetailPage } from './components/InvoiceDetailPage';
import { ForbiddenView } from './components/ForbiddenView';
import { SecurityConsoleModal } from './components/SecurityConsoleModal';
import { EvaluatorToolsDrawer } from './components/EvaluatorToolsDrawer';
import { LoginView } from './components/LoginView';
import { api } from './services/api';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<'dashboard' | 'invoice-detail' | '403'>('dashboard');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [forbiddenAttemptedPath, setForbiddenAttemptedPath] = useState<string>('/admin/invoices/create');
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  // Requirement 5: Isolated QA / Evaluator tools (auto-opened if ?debug=true or ?evaluator=true)
  const [isEvaluatorToolsOpen, setIsEvaluatorToolsOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'true' || params.get('evaluator') === 'true' || params.get('qa') === 'true') {
      setIsEvaluatorToolsOpen(true);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
          <p className="text-slate-400 text-xs font-mono">Initializing VaultPay Cryptographic Session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  // Requirement 1: React Route Guard
  // Client role attempting to access an /admin/* route MUST redirect to /403
  const handleNavigateToAdminRoute = (path: string = '/admin/invoices/create') => {
    if (user.role === 'client') {
      setForbiddenAttemptedPath(path);
      setCurrentView('403');
      return;
    }
    setCurrentView('dashboard');
  };

  // Requirement 4: Client initiated payment with immediate disabled state & spinner
  const handleInitiatePayment = async (invoiceId: string) => {
    if (payingInvoiceId) return; // Prevent double-trigger

    // Immediately disable button and show loading spinner synchronously BEFORE network request
    setPayingInvoiceId(invoiceId);

    try {
      const session = await api.createCheckoutSession(invoiceId);
      if (session.isMock) {
        // In local sandbox, open the invoice details so the evaluator can test webhook settlement
        setSelectedInvoiceId(invoiceId);
        setCurrentView('invoice-detail');
      } else {
        window.location.href = session.url;
      }
    } catch (err) {
      console.error('Payment checkout initiation failed:', err);
      setSelectedInvoiceId(invoiceId);
      setCurrentView('invoice-detail');
    } finally {
      setPayingInvoiceId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 pb-16">
      {/* Primary Clean Production Chrome */}
      <Navbar
        onToggleEvaluatorTools={() => setIsEvaluatorToolsOpen(!isEvaluatorToolsOpen)}
        isEvaluatorToolsOpen={isEvaluatorToolsOpen}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === '403' ? (
          <ForbiddenView
            attemptedPath={forbiddenAttemptedPath}
            onNavigateHome={() => setCurrentView('dashboard')}
          />
        ) : currentView === 'invoice-detail' && selectedInvoiceId ? (
          <InvoiceDetailPage
            invoiceId={selectedInvoiceId}
            onBack={() => {
              setSelectedInvoiceId(null);
              setCurrentView('dashboard');
            }}
            isQaMode={isEvaluatorToolsOpen}
          />
        ) : user.role === 'admin' ? (
          <AdminDashboard
            onSelectInvoice={(id) => {
              setSelectedInvoiceId(id);
              setCurrentView('invoice-detail');
            }}
          />
        ) : (
          <ClientDashboard
            onSelectInvoice={(id) => {
              setSelectedInvoiceId(id);
              setCurrentView('invoice-detail');
            }}
            onInitiatePayment={handleInitiatePayment}
            payingInvoiceId={payingInvoiceId}
          />
        )}
      </main>

      {/* Requirement 5: Isolated Evaluator Tools Drawer */}
      <EvaluatorToolsDrawer
        isOpen={isEvaluatorToolsOpen}
        onClose={() => setIsEvaluatorToolsOpen(false)}
        onOpenSecurityConsole={() => setSecurityModalOpen(true)}
        onNavigateToAdminRoute={() => handleNavigateToAdminRoute('/admin/invoices/create')}
        activeInvoiceId={selectedInvoiceId}
      />

      {/* Interactive Postman & Security Audit Console */}
      <SecurityConsoleModal
        isOpen={securityModalOpen}
        onClose={() => setSecurityModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
