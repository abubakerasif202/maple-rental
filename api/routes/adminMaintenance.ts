import express from 'express';
import { z } from 'zod';

import { authenticateAdmin } from '../middleware/auth.js';
import {
  IMPORTED_DATA_RESET_CONFIRMATION_PHRASE,
  IMPORTED_DATA_RESET_FEATURE_FLAG,
  isImportedDataResetEnabled,
  MaintenanceResetDisabledError,
  MaintenanceResetStepError,
  getImportedDataResetPlan,
  getResetExportPayload,
  resetImportedDataAndFinancials,
} from '../adminMaintenanceReset.js';
import {
  createMaintenanceResetToken,
  verifyMaintenanceResetToken,
} from '../maintenanceResetTokens.js';
import { recordAdminAuditEvent } from '../adminAudit.js';

const router = express.Router();
const CONFIRMATION_PHRASE = IMPORTED_DATA_RESET_CONFIRMATION_PHRASE;

const buildResetDisabledResponse = () => ({
  error: 'Imported data reset is disabled.',
  code: 'MAINTENANCE_RESET_DISABLED',
  message: `Destructive imported data reset is disabled unless ${IMPORTED_DATA_RESET_FEATURE_FLAG}=true.`,
  resetEnabled: false,
});

const requestSchema = z.object({
  confirm: z.string(),
  dryRunToken: z.string().min(1).optional(),
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
    res.json({
      ...payload,
      resetEnabled: isImportedDataResetEnabled(),
    });
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
      resetEnabled: isImportedDataResetEnabled(),
      dryRunToken: createMaintenanceResetToken({
        adminEmail: req.admin?.email || '',
        plan,
      }),
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
  if (!isImportedDataResetEnabled()) {
    return res.status(403).json(buildResetDisabledResponse());
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
  }
  try {
    requireConfirmation(parsed.data.confirm);
    const plan = await getImportedDataResetPlan();
    verifyMaintenanceResetToken({
      adminEmail: req.admin?.email || '',
      plan,
      token: parsed.data.dryRunToken || '',
    });
    const result = await resetImportedDataAndFinancials({
      adminEmail: req.admin?.email || null,
      reason: parsed.data.reason || null,
    });
    await recordAdminAuditEvent({
      action: 'imported_data_reset_completed',
      actor: req.admin?.email || null,
      metadata: { counts: result.counts, reason: parsed.data.reason || null },
      targetType: 'maintenance_reset',
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
    const rollbackSucceeded =
      error && typeof error === 'object' && 'rollbackSucceeded' in error
        ? (error as { rollbackSucceeded?: boolean | null }).rollbackSucceeded ?? null
        : null;
    const rollbackErrorCode =
      error && typeof error === 'object' && 'rollbackErrorCode' in error
        ? String((error as { rollbackErrorCode?: string | null }).rollbackErrorCode || null)
        : null;
    if (error instanceof MaintenanceResetDisabledError) {
      return res.status(403).json(buildResetDisabledResponse());
    }
    if (error instanceof MaintenanceResetStepError) {
      const hint = error.step === 'delete_invoices'
        ? 'Check invoice child tables or foreign key constraints.'
        : 'Check child rows, foreign key constraints, or schema drift.';
      console.error('[maintenance-reset] failed', {
        step: error.step,
        table: error.table || null,
        errorMessage: error.message,
        errorCode: error.code || null,
        rollbackSucceeded,
        rollbackErrorCode,
        details: null,
        hint,
      });
      return res.status(500).json({
        error: 'Failed to reset imported data',
        errorCode: error.code || null,
        step: error.step,
        table: error.table || null,
        message: error.message,
        hint,
        rollbackSucceeded,
      });
    }
    if (message.includes(CONFIRMATION_PHRASE)) {
      return res.status(400).json({ error: message });
    }
    if (/dry-run token|reset plan/i.test(message)) {
      return res.status(409).json({ error: message });
    }
    if (message.includes('No reliable imported markers')) {
      return res.status(400).json({ error: message });
    }
    console.error('[maintenance-reset] failed', {
      step:
        error && typeof error === 'object' && 'step' in error
          ? String((error as { step?: unknown }).step || 'unknown')
          : 'unknown',
      table:
        error && typeof error === 'object' && 'table' in error
          ? String((error as { table?: unknown }).table || '') || null
          : null,
      errorMessage: message,
      errorCode: error && typeof error === 'object' && 'code' in error ? String((error as any).code || null) : null,
      rollbackSucceeded,
      rollbackErrorCode,
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
