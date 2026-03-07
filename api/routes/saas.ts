import express from 'express';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { authenticateAdmin } from './auth.js';
import { STRIPE_CONFIG, SAAS_CONFIG } from '../constants.js';
import { merchantSchema } from '../validation.js';
import { z } from 'zod';
import {
  getMerchantCreatedAtColumn,
  getMerchantSelectColumns,
  toMerchantUpdatedAtPayload,
  toMerchantWritePayload,
} from '../schemaCompat.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', STRIPE_CONFIG);

const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
const ONBOARDING_REFRESH_URL = `${APP_URL}/admin/dashboard?onboardingStatus=refresh`;
const ONBOARDING_RETURN_URL = `${APP_URL}/admin/dashboard?onboardingStatus=complete`;

const createOnboardingLink = (accountId: string) =>
  stripe.accountLinks.create({
    account: accountId,
    refresh_url: ONBOARDING_REFRESH_URL,
    return_url: ONBOARDING_RETURN_URL,
    type: 'account_onboarding',
    collect: 'eventually_due',
  });

router.post('/merchants', authenticateAdmin, async (req, res) => {
  try {
    const data = merchantSchema.parse(req.body);

    const account = await stripe.accounts.create({
      type: 'express',
      country: data.country,
      email: data.email,
      business_type: 'company',
      business_profile: {
        mcc: SAAS_CONFIG.mcc,
        product_description: `${data.business_name} ${SAAS_CONFIG.product_description_suffix}`,
        url: SAAS_CONFIG.url,
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: data.payout_interval,
          },
        },
      },
      metadata: {
        platform: 'maple-rental-saas',
      },
    });

    const accountLink = await createOnboardingLink(account.id);

    const payload = await toMerchantWritePayload({
      name: data.business_name,
      email: data.email,
      country: data.country,
      stripe_account_id: account.id,
      payout_interval: data.payout_interval,
    });
    const selectColumns = await getMerchantSelectColumns();
    const { data: inserted, error: insertError } = await db
      .from('merchants')
      .insert([payload])
      .select(selectColumns)
      .single();

    if (insertError) throw insertError;

    res.status(201).json({
      merchant: inserted,
      onboarding_link: accountLink.url,
      onboarding_expires_at: accountLink.expires_at ? new Date(accountLink.expires_at * 1000).toISOString() : null,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('Create SaaS merchant error:', error);
    res.status(500).json({ error: 'Failed to create merchant' });
  }
});

router.get('/merchants', authenticateAdmin, async (_req, res) => {
  try {
    const selectColumns = await getMerchantSelectColumns();
    const orderColumn = await getMerchantCreatedAtColumn();
    const { data, error } = await db
      .from('merchants')
      .select(selectColumns)
      .order(orderColumn, { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Fetch SaaS merchants error:', error);
    res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

router.post('/merchants/:id/link', authenticateAdmin, async (req, res) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const selectColumns = await getMerchantSelectColumns();
    const { data: merchant, error: fetchError } = await db
      .from('merchants')
      .select(selectColumns)
      .eq('id', id)
      .single();
    if (fetchError || !merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const accountLink = await createOnboardingLink(merchant.stripe_account_id);

    const updatePayload = await toMerchantUpdatedAtPayload(new Date().toISOString());
    await db.from('merchants').update(updatePayload).eq('id', merchant.id);

    res.json({
      onboarding_link: accountLink.url,
      onboarding_expires_at: accountLink.expires_at ? new Date(accountLink.expires_at * 1000).toISOString() : null,
    });
  } catch (error) {
    console.error('Refresh onboarding link error:', error);
    res.status(500).json({ error: 'Failed to refresh onboarding link' });
  }
});

export default router;
