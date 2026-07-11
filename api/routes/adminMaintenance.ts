import express from 'express';
import { z } from 'zod';

import { authenticateAdmin } from '../middleware/auth.js';
import {
  IMPORTED_DATA_RESET_CONFIRMATION_PHRASE,
  MaintenanceResetStepError,
  getImportedDataResetPlan,
  getResetExportPayload,
  resetImportedDataAndFinancials,
} from '../adminMaintenanceReset.js';

const router = express.Router();
const CONFIRMATION_PHRASE = IMPORTED_DATA_RESET_CONFIRMATION_PHRASE;

const requestSchema = z.object({
  confirm: z.string(),
  dryRunToken: z.string().optional(),
  reason: z.string().trim().max(500).optional(),
});

const requireConfirmation = (confirm: string) => {
  if (confirm !== CONFIRMATION_PHRASE) {
    throw new Error(`You must type "${CONFIRMATION_PHRASE}" to confirm.`);
  }
};

const sendExportPayload = async (req: express.Request, res: express.Response) => {
  try {
    const payload = await getResetExportPayload(req.admin?.email || null);
    res.json(payload);
  } catch (error) {
    console.error('Admin maintenance export error:', error);
    res.status(500).json({ error: 'Failed to export reset payload' });
  }
};

const sendDryRun = async (
  req: express.Request,
  res: express.Response,
  options: { requireConfirmation: boolean },
) => {
  try {
    if (options.requireConfirmation) {
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      }
      requireConfirmation(parsed.data.confirm);
    }

    const plan = await getImportedDataResetPlan();
    res.json({
      success: true,
      dryRun: true,
      criteria: plan.criteria,
      counts: plan.counts,
      preserved: plan.preserved,
      dryRunToken: Buffer.from(
        JSON.stringify({ at: new Date().toISOString(), email: req.admin?.email || null }),
      ).toString('base64url'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run dry-run';
    if (message.includes(CONFIRMATION_PHRASE)) {
      return res.status(400).json({ error: message });
    }
    if (message.includes('No reliable imported markers')) {
      return res.status(400).json({ error: message });
    }
    console.error('Admin maintenance dry-run error:', error);
    res.status(500).json({ error: 'Failed to run dry-run' });
  }
};

const performReset = async (req: express.Request, res: express.Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
  }
  try {
    requireConfirmation(parsed.data.confirm);
    const result = await resetImportedDataAndFinancials({
      adminEmail: req.admin?.email || null,
      reason: parsed.data.reason || null,
    });
    console.info('Admin maintenance reset executed', {
      adminEmail: req.admin?.email || null,
      deleted: result.counts,
      reason: parsed.data.reason || null,
    });
    res.json({
      success: true,
      deleted: result.counts,
      preserved: {
        adminUsers: true,
        stripeExternalRecords: true,
        stripeWebhookEvents: true,
      },
      message: 'Imported customer data and local financial records reset completed.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset imported data';
    if (error instanceof MaintenanceResetStepError) {
      const hint = error.step === 'delete_invoices'
        ? 'Check invoice child tables or foreign key constraints.'
        : 'Check child rows, foreign key constraints, or schema drift.';
      console.error('[maintenance-reset] failed', {
        step: error.step,
        table: error.table || null,
        errorMessage: error.message,
        errorCode: error.code || null,
        details: null,
        hint,
      });
      return res.status(500).json({
        error: 'Failed to reset imported data',
        step: error.step,
        table: error.table || null,
        message: error.message,
        hint,
      });
    }
    if (message.includes(CONFIRMATION_PHRASE)) {
      return res.status(400).json({ error: message });
    }
    if (message.includes('No reliable imported markers')) {
      return res.status(400).json({ error: message });
    }
    console.error('[maintenance-reset] failed', {
      step: 'unknown',
      table: null,
      errorMessage: message,
      errorCode: error && typeof error === 'object' && 'code' in error ? String((error as any).code || null) : null,
      details: null,
      hint: null,
    });
    res.status(500).json({ error: 'Failed to reset imported data' });
  }
};

router.get('/imported-data-reset/dry-run', authenticateAdmin, (req, res) =>
  sendDryRun(req, res, { requireConfirmation: false }),
);
router.post('/imported-data-reset', authenticateAdmin, performReset);
router.get('/imported-data-reset/export', authenticateAdmin, sendExportPayload);

router.get('/reset-imported-data/export', authenticateAdmin, sendExportPayload);
router.post('/reset-imported-data/dry-run', authenticateAdmin, (req, res) =>
  sendDryRun(req, res, { requireConfirmation: true }),
);
router.post('/reset-imported-data', authenticateAdmin, performReset);

export default router;
