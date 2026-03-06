import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from './auth.js';

const router = express.Router();

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('rentals')
      .select(`
        *,
        applications:application_id(name),
        cars:car_id(name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedRentals = data.map((rental: any) => ({
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

export default router;
