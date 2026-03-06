import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from './auth.js';
import { carSchema } from '../validation.js';
import { z } from 'zod';

const router = express.Router();

router.get('/', async (_req, res) => {
  const { data, error } = await db.from('cars').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Fetch cars error', error);
    return res.status(500).json({ error: 'Failed to fetch cars' });
  }
  res.json(data || []);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await db.from('cars').select('*').eq('id', req.params.id).single();

  if (error || !data) {
    return res.status(404).json({ error: 'Car not found' });
  }
  res.json(data);
});

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const data = carSchema.parse(req.body);
    const { data: inserted, error } = await db.from('cars').insert([data]).select('id').single();

    if (error) throw error;
    res.status(201).json({ id: String(inserted.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Car creation error:', err);
    res.status(500).json({ error: 'Failed to create car' });
  }
});

router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const data = carSchema.parse(req.body);
    const { error } = await db.from('cars').update(data).eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Car update error:', err);
    res.status(500).json({ error: 'Failed to update car' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { error } = await db.from('cars').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Car deletion error:', error);
    res.status(500).json({ error: 'Failed to delete car' });
  }
});

export default router;
