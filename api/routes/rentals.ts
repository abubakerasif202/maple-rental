import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { getStripeClient } from '../stripeClient.js';
import {
  getRentalCreatedAtColumn,
  getRentalSelectColumns,
  getSchemaCompat,
} from '../schemaCompat.js';
import {
  getImportedApplicationIdSet,
  isImportedRentalRecord,
} from '../importedDataFilters.js';

const router = express.Router();

const cancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean(),
  confirm: z.literal('CANCEL SUBSCRIPTION'),
  reason: z.string().trim().max(500).optional(),
});

const getRentalStripeSubscriptionId = (rental: Record<string, unknown>) =>
  String(rental.stripe_subscription_id || rental.stripeSubscriptionId || '').trim();

const buildCancellationIdempotencyKey = ({
  cancelAtPeriodEnd,
  rentalId,
  subscriptionId,
}: {
  cancelAtPeriodEnd: boolean;
  rentalId: string;
  subscriptionId: string;
}) =>
  `admin-rental-subscription-cancel:${rentalId}:${subscriptionId}:${
    cancelAtPeriodEnd ? 'period-end' : 'immediate'
  }`;

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    const selectColumns = await getRentalSelectColumns({
      includeRelations: true,
      includeStripeFields: true,
    });
    const orderColumn = await getRentalCreatedAtColumn();
    const { data, error } = await db
      .from('rentals')
      .select(selectColumns)
      .order(orderColumn, { ascending: false });

    if (error) throw error;

    const { data: applications, error: applicationsError } = await db
      .from('applications')
      .select('*');

    if (applicationsError) throw applicationsError;

    const importedApplicationIds = getImportedApplicationIdSet(
      (applications || []) as Array<Record<string, any>>,
    );
    const formattedRentals = ((data || []) as Array<Record<string, any>>)
      .filter((rental) => !isImportedRentalRecord(rental, importedApplicationIds))
      .map((rental: any) => ({
      ...rental,
      applicant_name: rental.applications?.name,
      car_name: rental.cars?.name
    }));

    res.json(formattedRentals);
  } catch (error) {
    console.error('Fetch rentals error:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

router.post('/:rentalId/cancel-subscription', authenticateAdmin, async (req, res) => {
  const parsed = cancelSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues,
    });
  }

  const rentalId = String(req.params.rentalId || '').trim();
  if (!rentalId) {
    return res.status(400).json({ error: 'Rental ID is required' });
  }

  try {
    const selectColumns = await getRentalSelectColumns({ includeStripeFields: true });
    const { data: rental, error: rentalError } = await db
      .from('rentals')
      .select(selectColumns)
      .eq('id', rentalId)
      .single();

    if (rentalError || !rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const stripeSubscriptionId = getRentalStripeSubscriptionId(
      rental as unknown as Record<string, unknown>
    );
    if (!stripeSubscriptionId) {
      return res.status(400).json({
        error: 'No Stripe subscription is linked to this rental.',
      });
    }

    const { cancelAtPeriodEnd, reason } = parsed.data;
    const stripe = getStripeClient();
    const idempotencyKey = buildCancellationIdempotencyKey({
      cancelAtPeriodEnd,
      rentalId,
      subscriptionId: stripeSubscriptionId,
    });
    const metadata = {
      admin_cancelled_by: String(req.admin?.email || 'admin'),
      admin_cancellation_reason: reason || '',
      admin_cancellation_requested_at: new Date().toISOString(),
      maple_rental_id: rentalId,
    };

    const existingSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const subscription =
      existingSubscription.status === 'canceled'
        ? existingSubscription
        : cancelAtPeriodEnd
          ? await stripe.subscriptions.update(
              stripeSubscriptionId,
              {
                cancel_at_period_end: true,
                metadata,
              },
              { idempotencyKey }
            )
          : await stripe.subscriptions.cancel(
              stripeSubscriptionId,
              {},
              { idempotencyKey }
            );

    if (!cancelAtPeriodEnd || existingSubscription.status === 'canceled') {
      const compat = await getSchemaCompat();
      const payload: Record<string, unknown> = { status: 'Cancelled' };
      payload[compat.coreMode === 'camel' ? 'endDate' : 'end_date'] = new Date()
        .toISOString()
        .slice(0, 10);
      const updateResult = await db.from('rentals').update(payload).eq('id', rentalId);
      if (updateResult.error) {
        throw updateResult.error;
      }
    }

    console.info('Admin updated Stripe subscription cancellation', {
      adminEmail: req.admin?.email || null,
      cancelAtPeriodEnd,
      rentalId,
      stripeStatus: subscription.status,
      stripeSubscriptionId,
    });

    res.json({
      success: true,
      rentalId,
      stripeSubscriptionId,
      cancelAtPeriodEnd,
      stripeStatus: subscription.status,
      message: 'Subscription cancellation updated.',
    });
  } catch (error) {
    console.error('Admin subscription cancellation error:', error);
    res.status(500).json({ error: 'Failed to cancel Stripe subscription' });
  }
});

export default router;
