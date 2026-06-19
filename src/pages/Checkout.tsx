import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, CreditCard, Info, Loader2, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Seo from '../components/Seo';
import { createVehicleCheckoutSession, fetchApprovedPaymentContext } from '../lib/api';
import { getApiErrorMessage } from '../lib/errorHandling';
import {
  resolveCheckoutToken,
  scrubCheckoutTokenFromUrl,
} from '../lib/checkoutTokenUrl';
import { isUuid } from '../../shared/uuid';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

export default function Checkout() {
  const { id: applicationIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const [checkoutToken, setCheckoutToken] = useState(
    () => resolveCheckoutToken(searchParams, window.location.hash)
  );
  const [pageError, setPageError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const applicationId = isUuid(applicationIdParam || '') ? String(applicationIdParam) : '';
  const pageSeo = (
    <Seo
      title="Secure Checkout | Gala Rentals"
      description="Secure Gala Rentals checkout for approved applications."
      canonicalPath={applicationId ? `/checkout/${applicationId}` : '/checkout'}
      robots="noindex,nofollow"
    />
  );

  const {
    data: paymentContext,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['approved-payment-context', applicationId, checkoutToken],
    queryFn: () =>
      fetchApprovedPaymentContext({
        application_id: applicationId,
        checkout_token: checkoutToken,
      }),
    enabled: Boolean(applicationId && checkoutToken),
    retry: false,
  });

  useEffect(() => {
    if (searchParams.get('resume_payment') === '1') {
      setPageError('Stripe checkout was canceled. You can reopen the secure payment session below.');
    }
  }, [searchParams]);

  useEffect(() => {
    const syncCheckoutToken = () => {
      const nextToken = resolveCheckoutToken(searchParams, window.location.hash);

      setCheckoutToken((currentToken) =>
        currentToken === nextToken ? currentToken : nextToken
      );
    };

    syncCheckoutToken();
    window.addEventListener('hashchange', syncCheckoutToken);

    return () => {
      window.removeEventListener('hashchange', syncCheckoutToken);
    };
  }, [searchParams]);

  useEffect(() => {
    if (!checkoutToken) {
      return;
    }

    const scrubbedUrl = scrubCheckoutTokenFromUrl(new URL(window.location.href));
    if (scrubbedUrl.toString() !== window.location.href) {
      window.history.replaceState(window.history.state, '', scrubbedUrl.toString());
    }
  }, [checkoutToken]);

  const handleStartCheckout = async () => {
    if (!applicationId || !checkoutToken) {
      setPageError('This secure checkout link is incomplete. Contact the team for a fresh link.');
      return;
    }

    setIsRedirecting(true);
    setPageError(null);

    try {
      const session = await createVehicleCheckoutSession({
        application_id: applicationId,
        checkout_token: checkoutToken,
      });

      if (!session.checkout_url) {
        throw new Error(
          'Stripe did not return a checkout URL. Request a fresh secure checkout link from the Gala Rentals team.'
        );
      }

      window.location.assign(session.checkout_url);
    } catch (checkoutError) {
      setPageError(
        getApiErrorMessage(
          checkoutError,
          'Unable to start Stripe checkout. Request a fresh secure link if this keeps happening.'
        )
      );
    } finally {
      setIsRedirecting(false);
    }
  };

  if (!applicationId || !checkoutToken) {
    return (
      <>
        {pageSeo}
        <div className="min-h-screen bg-brand-navy flex items-center justify-center text-white px-6">
          <div className="max-w-lg text-center space-y-6">
            <p className="text-brand-gold text-[10px] font-bold uppercase tracking-widest">
              Secure link required
            </p>
            <h1 className="text-4xl font-bold uppercase tracking-tighter">
              This payment page needs a valid checkout link
            </h1>
            <p className="text-brand-grey font-light">
              Start with an Gala Rentals application so we can complete review, approve the vehicle,
              and issue a secure Stripe payment link.
            </p>
            <Link
              to="/apply"
              className="inline-flex items-center gap-2 bg-brand-gold text-brand-navy px-8 py-4 font-bold uppercase tracking-widest text-xs hover:bg-brand-gold-light transition-all"
            >
              Start Application
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        {pageSeo}
        <div className="min-h-screen bg-brand-navy flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-brand-gold animate-spin" />
        </div>
      </>
    );
  }

  if (error || !paymentContext) {
    return (
      <>
        {pageSeo}
        <div className="min-h-screen bg-brand-navy flex items-center justify-center text-white px-6">
          <div className="text-center space-y-4 max-w-xl">
            <p>Unable to load the payment details for this link.</p>
            <p className="text-sm text-brand-grey font-light">
              Request a fresh checkout link from Gala Rentals if this one has expired or was
              replaced by a newer application.
            </p>
            <Link to="/apply" className="text-brand-gold hover:underline">
              Submit a new application
            </Link>
          </div>
        </div>
      </>
    );
  }

  const { approved_vehicle, billing, vehicle_image } = paymentContext;
  const hasSetupFees = billing.setupFees > 0;

  return (
    <>
      {pageSeo}
      <div className="pt-32 pb-24 min-h-screen bg-brand-navy">
        <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <Link
            to="/apply"
            className="inline-flex items-center gap-2 text-brand-grey hover:text-brand-gold transition-colors mb-12 uppercase tracking-widest text-[10px] font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to application
          </Link>

          {pageError && (
            <div className="mb-8 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-50">
              {pageError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-7">
              <motion.div initial="hidden" animate="visible" variants={fadeIn} className="space-y-10">
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 uppercase tracking-tighter">
                    Secure <span className="text-brand-gold italic">Stripe Checkout</span>
                  </h1>
                  <p className="text-brand-grey font-light">
                    Review the approved vehicle and payment breakdown, then continue to Stripe.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 p-8 rounded-3xl space-y-8">
                  <div className="flex items-start gap-4">
                    <div className="bg-brand-gold/10 p-3 rounded-2xl">
                      <CreditCard className="w-5 h-5 text-brand-gold" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">
                        Hosted Stripe session
                      </p>
                        <p className="text-sm text-brand-grey font-light leading-relaxed">
                      Payment happens only after Gala Rentals has reviewed your application.
                        Stripe collects the approved bond, your first weekly payment, and any setup
                        fees before recurring weekly billing starts.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-brand-navy/40 px-5 py-5 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">
                      Approved vehicle
                    </p>
                    <p className="text-xl font-semibold text-white">{approved_vehicle}</p>
                      <p className="text-sm text-brand-grey font-light leading-relaxed">
                      Your application has already been reviewed by Gala Rentals. After Stripe
                      confirms payment, the team finalises onboarding, handover, and any remaining
                      operational steps directly with you.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartCheckout}
                    disabled={isRedirecting}
                    className="w-full bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isRedirecting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" /> Redirecting to Stripe
                      </>
                    ) : (
                      <>Continue to Stripe</>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-8 py-4 border-t border-white/5">
                    <div className="flex items-center gap-2 text-brand-grey text-[10px] font-bold uppercase tracking-widest">
                      <ShieldCheck className="w-4 h-4 text-brand-gold" /> SSL Secure
                    </div>
                    <div className="flex items-center gap-2 text-brand-grey text-[10px] font-bold uppercase tracking-widest">
                      <CreditCard className="w-4 h-4 text-brand-gold" /> Hosted by Stripe
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="lg:col-span-5">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="sticky top-32 space-y-8"
              >
                <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                  <div className="aspect-video relative">
                    <img src={vehicle_image} alt="Gala Rentals approved vehicle preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-brand-navy to-transparent opacity-60" />
                    <div className="absolute bottom-6 left-6">
                      <h3 className="text-xl font-bold text-white tracking-tight">{approved_vehicle}</h3>
                      <p className="text-brand-gold text-[10px] font-bold uppercase tracking-widest">
                        Reviewed and approved by Gala Rentals
                      </p>
                    </div>
                  </div>

                  <div className="p-8 space-y-6">
                    <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest border-b border-white/5 pb-4">
                      Payment breakdown
                    </h4>

                    <div className="space-y-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-brand-grey font-light">Security bond</span>
                        <span className="text-white font-bold">{formatCurrency(billing.bond)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-brand-grey font-light">First weekly payment</span>
                        <span className="text-white font-bold">{formatCurrency(billing.initialRental)}</span>
                      </div>
                      {hasSetupFees && (
                        <div className="flex justify-between">
                          <span className="text-brand-grey font-light">Setup fees</span>
                          <span className="text-white font-bold">{formatCurrency(billing.setupFees)}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                      <span className="text-white font-bold uppercase tracking-widest text-xs">Total due now</span>
                      <span className="text-3xl font-bold text-brand-gold">
                        {formatCurrency(billing.upfrontDue)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-brand-navy p-6 flex items-start gap-4">
                    <div className="bg-brand-gold/10 p-2 rounded-lg">
                      <Info className="w-4 h-4 text-brand-gold" />
                    </div>
                    <p className="text-[10px] text-brand-grey leading-relaxed">
                      After the upfront payment, your recurring rental will be{' '}
                      <strong>{formatCurrency(billing.recurringAmount)}</strong> {billing.recurringLabel}. Stripe
                      handles the payment securely and Gala Rentals completes the driver onboarding process after confirmation.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
