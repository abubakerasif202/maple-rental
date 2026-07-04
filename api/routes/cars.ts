import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { carSchema } from '../validation.js';
import { z } from 'zod';
import {
  getApplicationAssignedCarColumn,
  getCarArchivedAtColumn,
  getBookingCarIdColumn,
  getCarCreatedAtColumn,
  getCarSelectColumns,
  getLeaseAgreementCarIdColumn,
  getRentalCarIdColumn,
  toCarWritePayload,
} from '../schemaCompat.js';
import { enqueueIndexNowUrl } from '../services/indexNow.js';
import { calculateBondFromWeeklyRent } from '../../shared/rentalPricing.js';

import { syncRealtimeFleet } from '../../scripts/sync-realtime-fleet.js';

const router = express.Router();

router.post('/admin/sync', authenticateAdmin, async (_req, res) => {
  try {
    const summary = await syncRealtimeFleet();
    res.json({ success: true, summary });
  } catch (error) {
    console.error('[fleet-sync] Manual sync error:', error);
    res.status(500).json({ 
      error: 'Fleet synchronization failed', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});
type CarRecord = {
  archived_at?: string | null;
  bond: number;
  created_at?: string;
  id: number | string;
  image: string;
  model_year: number;
  name: string;
  status: string;
  weekly_price: number;
};

const archiveCarSchema = z.object({
  archived: z.boolean(),
});

const PUBLIC_REGISTRATION_SUFFIX_PATTERN =
  /\s*(?:\([A-Z0-9-]*\d[A-Z0-9-]*\)|[-|]\s*[A-Z0-9-]*\d[A-Z0-9-]*)\s*$/i;

const toCarBond = (car: Record<string, any>) => {
  const storedBond = Number(car.bond);
  return Number.isFinite(storedBond)
    ? storedBond
    : calculateBondFromWeeklyRent(Number(car.weekly_price || 0));
};

const toCarResponse = (car: Record<string, any>): CarRecord =>
  ({
    ...car,
    archived_at: car.archived_at ?? null,
    bond: toCarBond(car),
    image: '',
  }) as CarRecord;

const toPublicCarResponse = (car: Record<string, any>): CarRecord => {
  const fullCar = toCarResponse(car);
  const sanitizedName =
    fullCar.name.replace(PUBLIC_REGISTRATION_SUFFIX_PATTERN, '').trim() ||
    fullCar.name.trim();

  return {
    ...fullCar,
    name: sanitizedName,
    weekly_price: 0,
    bond: 0,
    image: '',
  };
};

const toPublicSiteOrigin = () => {
  const candidate = process.env.SITE_URL || process.env.APP_URL;
  if (!candidate) return null;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
};

const toCarPublicUrl = (id: string) => {
  const siteOrigin = toPublicSiteOrigin();
  if (!siteOrigin) {
    return null;
  }
  return `${siteOrigin}/cars/${id}`;
};

const notifyIndexNowForCarChange = (id: string, reason: 'created' | 'updated' | 'deleted') => {
  // Hook into create/update/delete events so search engines discover fresh URLs quickly.
  // In a CMS flow, call similar logic from your publish/unpublish handlers.
  const publicUrl = toCarPublicUrl(id);
  if (!publicUrl) {
    console.warn(`[IndexNow] Skipping ${reason} notification for car ${id}: SITE_URL is not configured.`);
    return;
  }

  enqueueIndexNowUrl(publicUrl);
};

const fetchCarById = async (id: string): Promise<CarRecord | null> => {
  const selectColumns = await getCarSelectColumns();
  const { data, error } = await db.from('cars').select(selectColumns).eq('id', id).single();

  if (error || !data) {
    return null;
  }

  return toCarResponse(data as Record<string, any>);
};

const countRowsForCar = async (table: string, column: string | null, id: string) => {
  if (!column) {
    return 0;
  }

  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, id);

  if (error) {
    throw error;
  }

  return count || 0;
};

const fetchCarsWithFallback = async ({ includeArchived = false }: { includeArchived?: boolean } = {}) => {
  const selectColumns = await getCarSelectColumns();
  const orderColumn = await getCarCreatedAtColumn();
  const archivedAtColumn = await getCarArchivedAtColumn();
  let query = db.from('cars').select(selectColumns).order(orderColumn, { ascending: false });

  if (!includeArchived) {
    query = query.eq(archivedAtColumn, null);
  }

  let { data, error } = await query;

  if (!error) {
    return { data: data || [], error: null as typeof error };
  }

  console.warn('Fetch cars ordered query failed, retrying with id hydration:', error);
  let idQuery = db.from('cars').select('id').order('id', { ascending: false });
  if (!includeArchived) {
    idQuery = idQuery.eq(archivedAtColumn, null);
  }

  const { data: idRows, error: idError } = await idQuery;

  if (idError) {
    return {
      data: null,
      error: idError,
    };
  }

  const cars = (
    await Promise.all(
      (idRows || []).map(async (row) => fetchCarById(String(row.id)))
    )
  ).filter((car): car is NonNullable<Awaited<ReturnType<typeof fetchCarById>>> => Boolean(car));

  return {
    data: cars,
    error: null as typeof error,
  };
};

router.get('/', async (_req, res) => {
  const { data, error } = await fetchCarsWithFallback();

  if (error) {
    console.error('Fetch cars error', error);
    return res.status(500).json({ error: 'Failed to fetch cars' });
  }
  res.json((data || []).map((car) => toPublicCarResponse(car as Record<string, any>)));
});

router.get('/admin/all', authenticateAdmin, async (_req, res) => {
  const { data, error } = await fetchCarsWithFallback({ includeArchived: true });

  if (error) {
    console.error('Fetch admin cars error', error);
    return res.status(500).json({ error: 'Failed to fetch cars' });
  }

  res.json((data || []).map((car) => toCarResponse(car as Record<string, any>)));
});

router.get('/:id', async (req, res) => {
  const data = await fetchCarById(req.params.id);

  if (!data || data.archived_at) {
    return res.status(404).json({ error: 'Car not found' });
  }
  res.json(toPublicCarResponse(data));
});

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const data = carSchema.parse(req.body);
    const payload = await toCarWritePayload(data);
    const { data: inserted, error } = await db.from('cars').insert([payload]).select('id').single();

    if (error) throw error;
    notifyIndexNowForCarChange(String(inserted.id), 'created');
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
    const existingCar = await fetchCarById(req.params.id);
    if (!existingCar) {
      return res.status(404).json({ error: 'Car not found' });
    }

    const data = carSchema.parse(req.body);
    const payload = await toCarWritePayload(data);
    const { error } = await db.from('cars').update(payload).eq('id', req.params.id);

    if (error) throw error;
    notifyIndexNowForCarChange(req.params.id, 'updated');
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Car update error:', err);
    res.status(500).json({ error: 'Failed to update car' });
  }
});

router.patch('/:id/archive', authenticateAdmin, async (req, res) => {
  try {
    const existingCar = await fetchCarById(req.params.id);
    if (!existingCar) {
      return res.status(404).json({ error: 'Car not found' });
    }

    const { archived } = archiveCarSchema.parse(req.body ?? {});
    const archivedAtColumn = await getCarArchivedAtColumn();

    if (archived && existingCar.status === 'Rented') {
      return res.status(409).json({
        error: 'This vehicle is currently rented. Complete the rental before archiving it.',
      });
    }

    const payload: Record<string, unknown> = {
      status: archived ? 'Maintenance' : 'Available',
    };
    payload[archivedAtColumn] = archived ? new Date().toISOString() : null;

    const { error } = await db.from('cars').update(payload).eq('id', req.params.id);
    if (error) {
      throw error;
    }

    notifyIndexNowForCarChange(req.params.id, 'updated');
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Car archive error:', error);
    res.status(500).json({ error: 'Failed to update vehicle archive status' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const existingCar = await fetchCarById(req.params.id);
    if (!existingCar) {
      return res.status(404).json({ error: 'Car not found' });
    }

    const [rentalCarIdColumn, bookingCarIdColumn, leaseAgreementCarIdColumn, applicationAssignedCarColumn] =
      await Promise.all([
        getRentalCarIdColumn(),
        getBookingCarIdColumn(),
        getLeaseAgreementCarIdColumn(),
        getApplicationAssignedCarColumn(),
      ]);

    const [activeRentalCount, bookingCount, leaseAgreementCount, assignedApplicationCount] =
      await Promise.all([
        countRowsForCar('rentals', rentalCarIdColumn, req.params.id),
        countRowsForCar('bookings', bookingCarIdColumn, req.params.id),
        countRowsForCar('lease_agreements', leaseAgreementCarIdColumn, req.params.id),
        countRowsForCar('applications', applicationAssignedCarColumn, req.params.id),
      ]);

    if (
      activeRentalCount > 0 ||
      bookingCount > 0 ||
      leaseAgreementCount > 0 ||
      assignedApplicationCount > 0
    ) {
      return res.status(409).json({
        error:
          'This vehicle is still referenced by rentals, bookings, or agreements. Remove those links before deleting the car.',
        usage: {
          assigned_applications: assignedApplicationCount,
          bookings: bookingCount,
          lease_agreements: leaseAgreementCount,
          rentals: activeRentalCount,
        },
      });
    }

    const { error } = await db.from('cars').delete().eq('id', req.params.id);
    if (error) throw error;
    notifyIndexNowForCarChange(req.params.id, 'deleted');
    res.json({ success: true });
  } catch (error) {
    console.error('Car deletion error:', error);
    res.status(500).json({ error: 'Failed to delete car' });
  }
});

export default router;
