import { Router } from 'express';
import { z } from 'zod';
import { createApplication } from '../services/applicationService.js';

const router = Router();

const applicationSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  password: z.string().min(8),
  licenseNumber: z.string().min(5),
  vehicleId: z.string().uuid(),
  experienceYears: z.coerce.number().int().min(0).max(50),
  preferredStartDate: z.string().optional(),
  notes: z.string().max(2000).optional().default(''),
});

router.post('/', async (request, response, next) => {
  try {
    const payload = applicationSchema.parse(request.body);
    const result = await createApplication(payload);

    response.status(201).json({
      message: 'Application submitted successfully',
      driver: result.driver,
      application: result.application,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
