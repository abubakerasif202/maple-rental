import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from './auth.js';
import { renderCarLeaseAgreement } from '../templates/carLeaseAgreement.js';
import { leaseAgreementSchema, createLeaseAgreementSchema } from '../validation.js';
import { z } from 'zod';

const router = express.Router();

router.get('/car-lease/template', (_req, res) => {
  const template = renderCarLeaseAgreement();
  res.type('text/markdown').send(template);
});

router.post('/car-lease/render', async (req, res) => {
  try {
    const payload = leaseAgreementSchema.parse(req.body ?? {});
    const rendered = renderCarLeaseAgreement(payload);
    res.json({ agreement: rendered });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('Render agreement error:', error);
    res.status(500).json({ error: 'Failed to render agreement' });
  }
});

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const data = createLeaseAgreementSchema.parse(req.body);
    const { data: inserted, error } = await db.from('lease_agreements').insert([data]).select('id').single();

    if (error) throw error;
    res.status(201).json({ id: String(inserted.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Lease agreement creation error:', err);
    res.status(500).json({ error: 'Failed to save lease agreement' });
  }
});

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('lease_agreements')
      .select(`
        *,
        applications:application_id(name),
        cars:car_id(name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedAgreements = data.map((item: any) => ({
      ...item,
      applicant_name: item.applications?.name,
      car_name: item.cars?.name
    }));

    res.json(formattedAgreements);
  } catch (error) {
    console.error('Fetch lease agreements error:', error);
    res.status(500).json({ error: 'Failed to fetch lease agreements' });
  }
});

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await db
      .from('lease_agreements')
      .select(`
        *,
        applications:application_id(name),
        cars:car_id(name)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Lease agreement not found' });
    }

    res.json({
      ...data,
      applicant_name: data.applications?.name,
      car_name: data.cars?.name
    });
  } catch (error) {
    console.error('Fetch lease agreement error:', error);
    res.status(500).json({ error: 'Failed to fetch lease agreement' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { error } = await db.from('lease_agreements').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Lease agreement deletion error:', error);
    res.status(500).json({ error: 'Failed to delete lease agreement' });
  }
});

export default router;
