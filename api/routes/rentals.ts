import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from './auth.js';
import { getRentalCreatedAtColumn, getRentalSelectColumns } from '../schemaCompat.js';

const router = express.Router();

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    const selectColumns = await getRentalSelectColumns({ includeRelations: true });
    const orderColumn = await getRentalCreatedAtColumn();
    const { data, error } = await db
      .from('rentals')
      .select(selectColumns)
      .order(orderColumn, { ascending: false });

    if (error) throw error;

    const formattedRentals = (data || []).map((rental: any) => ({
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
