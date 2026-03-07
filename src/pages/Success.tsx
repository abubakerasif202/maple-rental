import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Home } from 'lucide-react';
import api from '../lib/api';

export default function Success() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const paymentIntentId = searchParams.get('payment_intent');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    let isMounted = true;

    const verifyPayment = async () => {
      if (!sessionId && !paymentIntentId) {
        if (isMounted) {
          setStatus('error');
        }
        return;
      }

      try {
        const { data } = await api.post('/stripe/verify-payment', {
          sessionId,
          paymentIntentId,
        });

        if (isMounted) {
          setStatus(data.success ? 'success' : 'error');
        }
      } catch {
        if (isMounted) {
          setStatus('error');
        }
      }
    };

    verifyPayment();

    return () => {
      isMounted = false;
    };
  }, [sessionId, paymentIntentId]);

  return (
    <div className="min-h-screen bg-brand-charcoal flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-brand-gold selection:text-brand-charcoal">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-brand-charcoal border border-white/5 py-12 px-6 shadow-2xl rounded-2xl text-center">
          {status === 'loading' && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-gold"></div>
            </div>
          )}
          
          {status === 'success' && (
            <>
              <CheckCircle className="mx-auto h-20 w-20 text-brand-gold mb-8" />
              <h2 className="text-3xl font-serif font-bold text-white mb-4 tracking-tight">Payment Successful!</h2>
              <p className="text-brand-grey font-light leading-relaxed mb-10">
                Your payment has been confirmed. We&apos;ll email you with the next steps for your rental shortly.
              </p>
              <Link
                to="/"
                className="w-full flex justify-center items-center py-4 px-4 bg-brand-gold text-brand-charcoal font-bold text-sm uppercase tracking-widest hover:bg-white transition-colors shadow-[0_0_20px_rgba(198,169,79,0.1)]"
              >
                <Home className="mr-2 h-5 w-5" /> Return Home
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-900/20 mb-8 border border-red-500/30">
                <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-3xl font-serif font-bold text-white mb-4 tracking-tight">Payment Issue</h2>
              <p className="text-brand-grey font-light leading-relaxed mb-10">
                We couldn't verify your payment. Please try again or contact support if the amount has been deducted.
              </p>
              <Link
                to="/apply"
                className="w-full flex justify-center items-center py-4 px-4 bg-brand-gold text-brand-charcoal font-bold text-sm uppercase tracking-widest hover:bg-white transition-colors shadow-[0_0_20px_rgba(198,169,79,0.1)]"
              >
                Return to Application
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
