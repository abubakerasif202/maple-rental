import express from 'express';
import { z } from 'zod';

import {
  type AgreementTemplateRecord,
  fetchAgreementTemplateById,
  fetchAgreementTemplates,
} from '../agreementTemplates.js';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { renderCarLeaseAgreementTemplate } from '../templates/carLeaseAgreement.js';
import {
  agreementTemplateSchema,
  leaseAgreementSchema,
  updateAgreementTemplateSchema,
} from '../validation.js';

const router = express.Router();

const idParamsSchema = z.object({ id: z.coerce.number().int().nonnegative() });
const previewAgreementTemplateSchema = leaseAgreementSchema.extend({
  content: z.string().trim().min(1).max(50000).optional(),
});
const adminActorFromRequest = (req: express.Request) =>
  ('email' in (req.admin || {}) ? req.admin?.email : undefined) || 'admin';

const getAgreementTemplateRpcResult = (
  data: unknown,
  error: { message?: string } | null,
): AgreementTemplateRecord | null => {
  if (error) {
    throw error;
  }

  if (data == null) {
    return null;
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Agreement template transaction returned an invalid response.');
  }

  return data as AgreementTemplateRecord;
};

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    res.json(await fetchAgreementTemplates());
  } catch (error) {
    console.error('Fetch agreement templates error:', error);
    res.status(500).json({ error: 'Failed to fetch agreement templates' });
  }
});

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const parsedParams = idParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsedParams.error.issues });
    }

    const template = await fetchAgreementTemplateById(parsedParams.data.id);
    if (!template) {
      return res.status(404).json({ error: 'Agreement template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Fetch agreement template error:', error);
    res.status(500).json({ error: 'Failed to fetch agreement template' });
  }
});

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const payload = agreementTemplateSchema.parse(req.body ?? {});
    const result = await db.rpc('create_agreement_template_version', {
      p_activate: false,
      p_content: payload.content,
      p_name: payload.name,
      p_template_key: payload.template_key,
      p_updated_by: adminActorFromRequest(req),
    });
    const template = getAgreementTemplateRpcResult(result.data, result.error);
    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Create agreement template error:', error);
    res.status(500).json({ error: 'Failed to create agreement template' });
  }
});

router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const parsedParams = idParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsedParams.error.issues });
    }

    const payload = updateAgreementTemplateSchema.parse(req.body ?? {});
    const result = await db.rpc('revise_agreement_template', {
      p_content: payload.content,
      p_name: payload.name ?? null,
      p_source_id: parsedParams.data.id,
      p_updated_by: adminActorFromRequest(req),
    });
    const template = getAgreementTemplateRpcResult(result.data, result.error);
    if (!template) {
      return res.status(404).json({ error: 'Agreement template not found' });
    }

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Update agreement template error:', error);
    res.status(500).json({ error: 'Failed to update agreement template' });
  }
});

router.post('/:id/activate', authenticateAdmin, async (req, res) => {
  try {
    const parsedParams = idParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsedParams.error.issues });
    }

    const result = await db.rpc('activate_agreement_template', {
      p_template_id: parsedParams.data.id,
      p_updated_by: adminActorFromRequest(req),
    });
    const template = getAgreementTemplateRpcResult(result.data, result.error);
    if (!template) {
      return res.status(404).json({ error: 'Agreement template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Activate agreement template error:', error);
    res.status(500).json({ error: 'Failed to activate agreement template' });
  }
});

router.post('/:id/preview', authenticateAdmin, async (req, res) => {
  try {
    const parsedParams = idParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsedParams.error.issues });
    }

    const template = await fetchAgreementTemplateById(parsedParams.data.id);
    if (!template) {
      return res.status(404).json({ error: 'Agreement template not found' });
    }

    const { content, ...payload } = previewAgreementTemplateSchema.parse(req.body ?? {});
    res.json({
      agreement: renderCarLeaseAgreementTemplate(content || template.content, payload),
      agreementTemplateVersion: template.version,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Preview agreement template error:', error);
    res.status(500).json({ error: 'Failed to preview agreement template' });
  }
});

export default router;
