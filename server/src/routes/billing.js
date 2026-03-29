import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { forbidden, notFound } from '../lib/httpError.js';
import { requireAuth } from '../middleware/auth.js';
import { getApplicationById } from '../services/applicationService.js';
import {
  createCheckoutSession,
  createCustomerPortal,
  createDirectSubscription,
  getBillingSummary,
} from '../services/subscriptionService.js';

const router = Router();

const checkoutSchema = z.object({
  intent: z.literal('checkout'),
  applicationId: z.string().uuid(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const directSubscriptionSchema = z.object({
  intent: z.literal('subscription'),
  applicationId: z.string().uuid(),
  paymentMethodId: z.string().min(3),
});

const portalSchema = z.object({
  intent: z.literal('portal'),
  driverId: z.string().uuid().optional(),
  returnUrl: z.string().url().optional(),
});

const subscribeSchema = z.discriminatedUnion('intent', [
  checkoutSchema,
  directSubscriptionSchema,
  portalSchema,
]);

const requireApplicationAccess = async (applicationId, user) => {
  const application = await getApplicationById(applicationId);
  if (!application) {
    throw notFound('Application not found');
  }

  if (user.role !== 'admin' && application.driver_id !== user.driverId) {
    throw forbidden('You do not have access to this application');
  }

  return application;
};

router.get('/billing', requireAuth, async (request, response, next) => {
  try {
    const summary = await getBillingSummary(request.user.driverId);
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

router.post('/subscribe', requireAuth, async (request, response, next) => {
  try {
    const payload = subscribeSchema.parse(request.body);

    if (payload.intent === 'checkout') {
      await requireApplicationAccess(payload.applicationId, request.user);
      const session = await createCheckoutSession({
        applicationId: payload.applicationId,
        successUrl: payload.successUrl || `${env.APP_URL || env.CLIENT_URL}/billing?checkout=success`,
        cancelUrl: payload.cancelUrl || `${env.APP_URL || env.CLIENT_URL}/billing?checkout=cancelled`,
      });
      response.json(session);
      return;
    }

    if (payload.intent === 'subscription') {
      await requireApplicationAccess(payload.applicationId, request.user);
      const subscription = await createDirectSubscription({
        applicationId: payload.applicationId,
        paymentMethodId: payload.paymentMethodId,
      });
      response.json({ subscription });
      return;
    }

    if (
      request.user.role !== 'admin' &&
      payload.driverId &&
      payload.driverId !== request.user.driverId
    ) {
      throw forbidden('You do not have access to this billing portal');
    }

    const portal = await createCustomerPortal({
      driverId:
        request.user.role === 'admin'
          ? payload.driverId || request.user.driverId
          : request.user.driverId,
      returnUrl: payload.returnUrl || `${env.APP_URL || env.CLIENT_URL}/billing`,
    });

    response.json({ url: portal.url });
  } catch (error) {
    next(error);
  }
});

export default router;
