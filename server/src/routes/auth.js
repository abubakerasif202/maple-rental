import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/httpError.js';
import { createSessionToken } from '../lib/sessionToken.js';
import { supabaseAuth } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { getDriverByAuthUserId, getDriverByEmail, getDriverDashboard } from '../services/driverService.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/', async (request, response, next) => {
  try {
    const { email, password } = loginSchema.parse(request.body);
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      throw unauthorized('Invalid email or password');
    }

    const driver =
      (await getDriverByAuthUserId(data.user.id)) || (await getDriverByEmail(email));
    const role = driver?.role || (email === env.ADMIN_EMAIL ? 'admin' : 'driver');
    const token = createSessionToken({
      driverId: driver?.id || null,
      authUserId: data.user.id,
      email: data.user.email || email,
      role,
    });

    response.json({
      token,
      user: {
        id: driver?.id || data.user.id,
        authUserId: data.user.id,
        email: data.user.email || email,
        role,
        status: driver?.status || 'approved',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (request, response, next) => {
  try {
    if (request.user.role === 'admin') {
      response.json({
        user: request.user,
        dashboard: null,
      });
      return;
    }

    const dashboard = await getDriverDashboard(request.user.driverId);
    response.json({
      user: request.user,
      dashboard,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
