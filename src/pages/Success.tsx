import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Home, Loader2, RefreshCw } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchCheckoutSessionStatus } from '../lib/api';
import { getCheckoutStatusPresentation } from '../lib/checkoutSessionStatus';
import {
  buildCheckoutTokenHash,
  resolveCheckoutToken,
  scrubCheckoutTokenFromUrl,
} from '../lib/checkoutTokenUrl';
import { isUuid } from '../../shared/uuid';

const MAX_CHECKOUT_STATUS_POLLS = 20;

export default function Success() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id') || '';
  const applicationIdParam = searchParams.get('application_id') || '';
  const applicationId = isUuid(applicationIdParam) ? applicationIdParam : '';
  const [checkoutToken, setCheckoutToken] = useState(
    () => resolveCheckoutToken(searchParams, window.location.hash)
  );
  const [pollAttempts, setPollAttempts] = useState(0);
  const hasVerificationContext = Boolean(sessionId && applicationId);

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
    window.history.replaceState(window.history.state, '', scrubbedUrl.toString());
  }, [checkoutToken]);

  useEffect(() => {
    setPollAttempts(0);
  }, [applicationId, checkoutToken, sessionId]);

  const pollingTimedOut = pollAttempts >= MAX_CHECKOUT_STATUS_POLLS;

  const { data, dataUpdatedAt, isFetching, isLoading, isError, refetch } = useQuery({
    queryKey: ['stripe-checkout-session', sessionId, applicationId, checkoutToken],
    queryFn: () =>
      fetchCheckoutSessionStatus(sessionId, {
        application_id: applicationId,
        checkout_token: checkoutToken || null,
      }),
    enabled: hasVerificationContext,
    retry: (failureCount, error) =>
      failureCount < 2 &&
      (!axios.isAxiosError(error) ||
        !error.response ||
        error.response.status >= 500),
    retryDelay: (attempt) => attempt * 1500,
    refetchInterval: (query) =>
      query.state.data &&
      getCheckoutStatusPresentation({
        data: query.state.data,
        hasVerificationContext,
        isError: false,
        pollingTimedOut,
      }).shouldRefetch
        ? 3000
        : false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!data || pollingTimedOut) {
      return;
    }

    const nextPresentation = getCheckoutStatusPresentation({
      data,
      hasVerificationContext,
      isError: false,
    });

    if (nextPresentation.shouldRefetch) {
      setPollAttempts((current) =>
        Math.min(current + 1, MAX_CHECKOUT_STATUS_POLLS)
      );
    }
  }, [data, dataUpdatedAt, hasVerificationContext, pollingTimedOut]);

  const presentation = getCheckoutStatusPresentation({
    data,
    hasVerificationContext,
    isError,
    pollingTimedOut,
  });
  const isFullySuccessful = presentation.tone === 'success';
  const requiresActivationReview = presentation.tone === 'review';
  const isAwaitingFinalization =
    presentation.tone === 'processing' && presentation.state === 'pending_webhook';
  const isProcessingSetup =
    presentation.tone === 'processing' && presentation.state === 'processing';
  const retryHref =
    hasVerificationContext && checkoutToken
      ? `/checkout/${applicationId}${buildCheckoutTokenHash(checkoutToken)}`
      : '/apply';
  const canRetryStatusCheck =
    hasVerificationContext &&
    (pollingTimedOut || (isError && !isLoading));
  const handleRetryStatusCheck = () => {
    setPollAttempts(0);
    void refetch();
  };
  const statusRetryButton = canRetryStatusCheck ? (
    <button
      type="button"
      onClick={handleRetryStatusCheck}
      disabled={isFetching}
      className="mb-4 w-full flex justify-center items-center py-4 px-4 border border-white/10 text-white font-bold text-sm uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-60"
    >
      {isFetching ? (
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-5 w-5" />
      )}
      {isError ? 'Retry Status Check' : 'Check Status Again'}
    </button>
  ) : null;

  return (
    <div className="min-h-screen bg-brand-charcoal flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-brand-gold selection:text-brand-charcoal">
      <Seo
        title="Payment Status | Gala Rentals"
        description="Secure payment status page for Gala Rentals checkout sessions."
        canonicalPath="/success"
        robots="noindex,nofollow"
      />

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-brand-charcoal border border-white/5 py-12 px-6 shadow-2xl rounded-2xl text-center">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-12 w-12 text-brand-gold animate-spin" />
            </div>
          )}

          {!isLoading && isFullySuccessful && (
            <>
              <CheckCircle className="mx-auto h-20 w-20 text-brand-gold mb-8" />
              <h2 className="text-3xl font-serif font-bold text-white mb-4 tracking-tight">
                {presentation.title}
              </h2>
                <p className="text-brand-grey font-light leading-relaxed mb-10">
                  {presentation.body}
                </p>
                <Link
                  to="/"
                  className="w-full flex justify-center items-center py-4 px-4 bg-brand-gold text-brand-charcoal font-bold text-sm uppercase tracking-widest hover:bg-white transition-colors shadow-[0_0_20px_rgba(198,169,79,0.1)]"
                >
                  <Home className="mr-2 h-5 w-5" /> Return Home
                </Link>
            </>
          )}

          {!isLoading && (isAwaitingFinalization || isProcessingSetup) && (
            <>
              {presentation.showSpinner && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-12 w-12 text-brand-gold animate-spin" />
                </div>
              )}
              <h2 className="text-3xl font-serif font-bold text-white mb-4 tracking-tight">
                {presentation.title}
              </h2>
              <p className="text-brand-grey font-light leading-relaxed mb-10">
                {presentation.body}
              </p>
              {statusRetryButton}
              <Link
                to="/"
                className="w-full flex justify-center items-center py-4 px-4 bg-brand-gold text-brand-charcoal font-bold text-sm uppercase tracking-widest hover:bg-white transition-colors shadow-[0_0_20px_rgba(198,169,79,0.1)]"
              >
                <Home className="mr-2 h-5 w-5" /> Return Home
              </Link>
            </>
          )}

          {!isLoading && requiresActivationReview && (
            <>
              <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-amber-500/10 mb-8 border border-amber-500/30">
                <svg className="h-10 w-10 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
              </div>
              <h2 className="text-3xl font-serif font-bold text-white mb-4 tracking-tight">
                {presentation.title}
              </h2>
              <p className="text-brand-grey font-light leading-relaxed mb-10">
                {presentation.body}
              </p>
              {statusRetryButton}
              <Link
                to="/"
                className="w-full flex justify-center items-center py-4 px-4 bg-brand-gold text-brand-charcoal font-bold text-sm uppercase tracking-widest hover:bg-white transition-colors shadow-[0_0_20px_rgba(198,169,79,0.1)]"
              >
                <Home className="mr-2 h-5 w-5" /> Return Home
              </Link>
            </>
          )}

          {!isLoading && !isFullySuccessful && !isAwaitingFinalization && !isProcessingSetup && !requiresActivationReview && (
            <>
              <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-900/20 mb-8 border border-red-500/30">
                <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-3xl font-serif font-bold text-white mb-4 tracking-tight">
                {presentation.title}
              </h2>
              <p className="text-brand-grey font-light leading-relaxed mb-10">
                {presentation.body}
              </p>
              {statusRetryButton}
              <Link
                to={presentation.showSecurePaymentLink ? retryHref : '/'}
                className="w-full flex justify-center items-center py-4 px-4 bg-brand-gold text-brand-charcoal font-bold text-sm uppercase tracking-widest hover:bg-white transition-colors shadow-[0_0_20px_rgba(198,169,79,0.1)]"
              >
                {presentation.showSecurePaymentLink ? 'Return to Secure Payment' : 'Return Home'}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
