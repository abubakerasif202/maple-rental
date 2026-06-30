import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, Toaster } from '@fluentui/react-components';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { mapleFluentTheme } from './theme/mapleFluentTheme';

const Home = lazy(() => import('./pages/Home'));
const Fleet = lazy(() => import('./pages/Cars'));
const Pricing = lazy(() => import('./pages/Pricing'));
const CarDetails = lazy(() => import('./pages/CarDetails'));
const Success = lazy(() => import('./pages/Success'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const Apply = lazy(() => import('./pages/Apply'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Contact = lazy(() => import('./pages/Contact'));
const MyRental = lazy(() => import('./pages/MyRental'));
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
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-brand-navy text-white font-serif italic uppercase tracking-widest text-sm">
              Loading Experience...
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/fleet" element={<Fleet />} />
            <Route path="/cars" element={<Fleet />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/cars/:id" element={<CarDetails />} />
            <Route path="/fleet/:id" element={<CarDetails />} />
            <Route path="/checkout/:id" element={<Checkout />} />
            <Route path="/apply" element={<Apply />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/my-rental" element={<MyRental />} />
            <Route path="/success" element={<Success />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/agreements" element={<AdminDashboard />} />
            <Route path="/admin/toll-notices" element={<AdminDashboard />} />
          </Routes>
        </Suspense>
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
