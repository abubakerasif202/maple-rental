import { AlertCircle, Loader2 } from 'lucide-react';
import { Suspense, useEffect, useState, lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { verifyAdminSession } from '../lib/api';
import { classifyAdminSessionFailure } from '../lib/adminSession';

const AdminDashboard = lazy(() => import('./AdminDashboard'));

export default function AdminDashboardRoute() {
  const [sessionState, setSessionState] = useState<
    'checking' | 'ready' | 'unauthorized' | 'forbidden' | 'error'
  >('checking');

  useEffect(() => {
    let isActive = true;

    void verifyAdminSession()
      .then(() => {
        if (isActive) {
          setSessionState('ready');
        }
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        const failureState = classifyAdminSessionFailure(error);
        if (failureState === 'unauthorized') {
          setSessionState('unauthorized');
          return;
        }

        if (failureState === 'forbidden') {
          setSessionState('forbidden');
          return;
        }

        setSessionState('error');
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (sessionState === 'checking') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-brand-navy text-white">
        <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-brand-gold">
          <Loader2 className="w-5 h-5 animate-spin" />
          Verifying session
        </div>
      </div>
    );
  }

  if (sessionState === 'unauthorized') {
    return <Navigate to="/admin/login" replace />;
  }

  if (sessionState === 'error') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-brand-navy px-6 text-white">
        <div className="max-w-lg rounded-3xl border border-red-500/20 bg-white/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-red-400" />
          <p className="text-sm font-light text-brand-grey">
            We could not verify the admin session right now. Refresh and try again.
          </p>
        </div>
      </div>
    );
  }

  if (sessionState === 'forbidden') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-brand-navy px-6 text-white">
        <div className="max-w-lg rounded-3xl border border-amber-500/20 bg-white/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-amber-300" />
          <p className="text-sm font-light text-brand-grey">
            This signed-in account does not have Gala Rentals admin access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center bg-brand-navy text-white">
          <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-brand-gold">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading dashboard...
          </div>
        </div>
      }
    >
      <AdminDashboard />
    </Suspense>
  );
}
