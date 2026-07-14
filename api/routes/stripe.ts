import express from 'express';
import { z } from 'zod';

import {
  createVehicleCheckoutLink,
  createVehicleCheckoutSession,
  getVehicleCheckoutSessionStatus,
  getVehiclePaymentContext,
} from '../services/stripeCheckoutService.js';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  uuidSchema,
  vehicleCheckoutLinkSchema,
  vehicleCheckoutSessionSchema,
} from '../validation.js';
import {
  buildPublicRentalPlan,
  rentalPlans,
} from '../../src/lib/rentalPlans.js';
import { LEASE_SETTINGS } from '../constants.js';

const router = express.Router();

const getSafeErrorLogContext = (error: unknown) => ({
  errorCode:
    error && typeof error === 'object' && 'code' in error
      ? String(error.code || '').slice(0, 64) || null
      : null,
  errorName: error instanceof Error ? error.name : 'UnknownError',
  errorType:
    error && typeof error === 'object' && 'type' in error
      ? String(error.type || '').slice(0, 64) || null
      : null,
  statusCode:
    error && typeof error === 'object' && 'statusCode' in error
      ? Number(error.statusCode) || null
      : null,
});

const isStripeConfigurationError = (
  error: unknown
): error is { code?: string; message?: string; type?: string } =>
  Boolean(
    error &&
      typeof error === 'object' &&
      (('type' in error && (error as { type?: string }).type === 'StripeAuthenticationError') ||
        ('code' in error &&
          ['api_key_expired', 'api_key_invalid'].includes(
            String((error as { code?: string }).code || '')
          )))
  );

const isStripeResourceMissingError = (
  error: unknown
): error is { code?: string; statusCode?: number; type?: string } =>
  Boolean(
    error &&
      typeof error === 'object' &&
      String((error as { code?: string }).code || '') === 'resource_missing' &&
      Number((error as { statusCode?: number }).statusCode || 0) === 404
  );

const isStripeSdkError = (
  error: unknown
): error is { message: string; statusCode?: number; type?: string } => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    message?: unknown;
    raw?: unknown;
    type?: unknown;
  };
  const type = typeof candidate.type === 'string' ? candidate.type : '';
  const raw = candidate.raw;
  const hasStripeRaw =
    raw &&
    typeof raw === 'object' &&
    ('type' in raw || 'code' in raw || 'message' in raw);

  return (
    typeof candidate.message === 'string' &&
    (type.startsWith('Stripe') || Boolean(hasStripeRaw))
  );
};

const getStripeSdkErrorStatus = (error: { statusCode?: number; type?: string }) => {
  if (
    typeof error.statusCode === 'number' &&
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 600
  ) {
    return error.statusCode;
  }

  switch (error.type) {
    case 'StripeAuthenticationError':
    case 'StripeInvalidGrantError':
      return 401;
    case 'StripeCardError':
      return 402;
    case 'StripePermissionError':
      return 403;
    case 'StripeIdempotencyError':
      return 409;
    case 'StripeRateLimitError':
      return 429;
    case 'StripeConnectionError':
      return 503;
    case 'StripeAPIError':
    case 'StripeUnknownError':
      return 502;
    case 'StripeInvalidRequestError':
    case 'StripeSignatureVerificationError':
    case 'TemporarySessionExpiredError':
      return 400;
    default:
      return 502;
  }
};

const getCheckoutSessionStripeErrorResponse = (error: {
  message: string;
  statusCode?: number;
  type?: string;
}) => {
  const retryableTypes = new Set([
    'StripeAPIError',
    'StripeConnectionError',
    'StripeUnknownError',
  ]);

  if (retryableTypes.has(String(error.type || ''))) {
    return {
      error: 'Stripe is temporarily unavailable. Please try again shortly.',
      status: 503,
    };
  }

  return {
    error: error.message,
    status: getStripeSdkErrorStatus(error),
  };
};

const isVehicleCheckoutConflictMessage = (message: string) => {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('payment link') ||
    normalizedMessage.includes('manual review') ||
    normalizedMessage.includes('activation is pending') ||
    normalizedMessage.includes('no longer available') ||
    normalizedMessage.includes('reload the latest link') ||
    normalizedMessage.includes('already been received')
  );
};

const getCheckoutTokenFromRequest = (
  req: express.Request,
  fallbackToken?: string | null
) => {
  const headerToken = req.header('x-checkout-token');
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  if (typeof fallbackToken === 'string' && fallbackToken.trim()) {
    return fallbackToken.trim();
  }

  const queryToken = req.query.checkout_token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }

  return null;
};

router.get('/rental-plans', (_req, res) => {
  res.json(rentalPlans.map((plan) => buildPublicRentalPlan(plan)));
});

router.get('/lease-settings', (_req, res) => {
  res.json({
    currency: LEASE_SETTINGS.currency.toUpperCase(),
    recurring_interval: LEASE_SETTINGS.recurring_interval,
    minimum_rental_weeks: LEASE_SETTINGS.minimum_rental_weeks,
    insurance_coverage_region: LEASE_SETTINGS.insurance_coverage_region,
    fees: LEASE_SETTINGS.fees,
  });
});

router.get('/payment-context', async (req, res) => {
  try {
    const { application_id, checkout_token } = z
      .object({
        application_id: uuidSchema,
        checkout_token: z.string().min(1).optional(),
      })
      .parse(req.query);
    const resolvedCheckoutToken = getCheckoutTokenFromRequest(req, checkout_token);

    if (!resolvedCheckoutToken) {
      return res.status(400).json({
        error: 'Validation failed',
        details: [
          {
            code: 'custom',
            message: 'checkout_token is required',
            path: ['checkout_token'],
          },
        ],
      });
    }

    const response = await getVehiclePaymentContext({
      applicationId: application_id,
      checkoutToken: resolvedCheckoutToken,
    });

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    if (error instanceof Error && error.message === 'Application not found') {
      return res.status(404).json({ error: error.message });
    }

    if (
      error instanceof Error &&
      (error.message.toLowerCase().includes('payment link') ||
        error.message.toLowerCase().includes('manual review') ||
        error.message.toLowerCase().includes('activation is pending'))
    ) {
      return res.status(409).json({ error: error.message });
    }

    if (error instanceof Error && error.message.toLowerCase().includes('checkout token')) {
      return res.status(401).json({ error: error.message });
    }

    console.error('Payment context error', getSafeErrorLogContext(error));
    res.status(500).json({ error: 'Failed to load the payment link details' });
  }
});

router.post('/vehicle-checkout-session', async (req, res) => {
  try {
    const { application_id, checkout_token } = vehicleCheckoutSessionSchema.parse(req.body);
    const responsePayload = await createVehicleCheckoutSession({
      applicationId: application_id,
      checkoutToken: checkout_token,
    });

    res.json(responsePayload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    if (isStripeConfigurationError(error)) {
      console.error(
        'Stripe configuration error during vehicle checkout session',
        getSafeErrorLogContext(error)
      );
      return res.status(503).json({
        error: 'Payments are temporarily unavailable. Please contact support.',
      });
    }

    if (isStripeSdkError(error)) {
      const stripeFailure = getCheckoutSessionStripeErrorResponse(error);
      console.error(
        'Stripe checkout session creation failed',
        getSafeErrorLogContext(error)
      );
      return res.status(stripeFailure.status).json({
        error: stripeFailure.error,
      });
    }

    if (
      error instanceof Error &&
      (error.message === 'Application not found' || error.message === 'Car not found')
    ) {
      return res.status(404).json({ error: error.message });
    }

    if (error instanceof Error && isVehicleCheckoutConflictMessage(error.message)) {
      return res.status(409).json({ error: error.message });
    }

    if (error instanceof Error && 'status' in error && error.status === 503) {
      return res.status(503).json({
        error: error.message,
      });
    }

    if (error instanceof Error && error.message.toLowerCase().includes('checkout token')) {
      return res.status(401).json({ error: error.message });
    }

    console.error(
      'Vehicle checkout session error',
      getSafeErrorLogContext(error)
    );
    res.status(500).json({ error: 'Failed to create the vehicle checkout session' });
  }
});

router.post('/vehicle-checkout-link', authenticateAdmin, async (req, res) => {
  try {
    const { application_id } = vehicleCheckoutLinkSchema.parse(req.body);
    const response = await createVehicleCheckoutLink({
      applicationId: application_id,
    });
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    if (error instanceof Error && 'status' in error && error.status === 503) {
      return res.status(503).json({ error: error.message });
    }

    if (
      error instanceof Error &&
      (error.message.toLowerCase().includes('payment link') ||
        isVehicleCheckoutConflictMessage(error.message))
    ) {
      return res.status(409).json({ error: error.message });
    }

    console.error(
      'Vehicle checkout link error',
      getSafeErrorLogContext(error)
    );
    res.status(500).json({ error: 'Failed to generate the vehicle checkout link' });
  }
});

router.get('/checkout-sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(req.params);
    const { application_id, checkout_token } = z
      .object({
        application_id: uuidSchema,
        checkout_token: z.string().min(1).optional(),
      })
      .parse(req.query);
    const resolvedCheckoutToken = getCheckoutTokenFromRequest(req, checkout_token);

    const response = await getVehicleCheckoutSessionStatus({
      applicationId: application_id,
      checkoutToken: resolvedCheckoutToken,
      sessionId,
    });

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    if (error instanceof Error && error.message.toLowerCase().includes('checkout token')) {
      return res.status(401).json({ error: error.message });
    }

    if (
      error instanceof Error &&
      (error.message === 'Checkout session does not match this application.' ||
        error.message === 'Checkout session does not match this payment link.' ||
        error.message === 'Checkout session vehicle does not match this payment link.' ||
        error.message === 'Checkout session belongs to an outdated payment link.')
    ) {
      return res.status(403).json({
        error: error.message,
        metadata_match: {
          matched: false,
          reason: error.message,
        },
        state: 'failed',
      });
    }

    if (isStripeResourceMissingError(error)) {
      return res.status(404).json({ error: 'Checkout session not found.' });
    }

    if (isStripeSdkError(error)) {
      return res
        .status(getStripeSdkErrorStatus(error))
        .json({ error: error.message });
    }

    console.error(
      'Checkout session fetch error',
      getSafeErrorLogContext(error)
    );
    res.status(500).json({ error: 'Failed to fetch checkout session status' });
  }
});

export default router;
