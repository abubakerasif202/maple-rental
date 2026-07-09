import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, Toaster } from '@fluentui/react-components';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { mapleFluentTheme } from './theme/mapleFluentTheme';

const Home = lazy(() => import('./pages/Home'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Success = lazy(() => import('./pages/Success'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const Apply = lazy(() => import('./pages/Apply'));
const Checkout = lazy(() => import('./pages/Checkout'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboardRoute'));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function AppShell() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="flex min-h-screen flex-col bg-brand-navy">
      {!isAdminRoute && <Navbar />}
      <main className="flex-grow">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex min-h-[70vh] items-center justify-center bg-brand-navy px-6 text-center text-white">
                <div className="space-y-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.38em] text-brand-gold">
                    Loading Experience
                  </div>
                  <div className="font-serif text-3xl italic sm:text-4xl">
                    Preparing Maple Rentals
                  </div>
                </div>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/cars" element={<Navigate to="/apply" replace />} />
              <Route path="/cars/:id" element={<Navigate to="/apply" replace />} />
              <Route path="/checkout/:id" element={<Checkout />} />
              <Route path="/apply" element={<Apply />} />
              <Route path="/success" element={<Success />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/agreements" element={<AdminDashboard />} />
              <Route path="/admin/toll-notices" element={<AdminDashboard />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!isAdminRoute && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FluentProvider theme={mapleFluentTheme} className="min-h-screen bg-brand-navy">
        <Toaster toasterId="maple-admin-toaster" position="bottom" />
        <Router>
          <AppShell />
        </Router>
      </FluentProvider>
    </QueryClientProvider>
  );
}
