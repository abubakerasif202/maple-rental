import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { approveApplication, rejectApplication } from '../services/applicationService.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

router.use(requireAdmin);

router.get('/', async (_request, response, next) => {
  try {
    const [
      pendingApplications,
      vehicles,
      subscriptions,
      payments,
      notifications,
      pendingCount,
      activeCount,
      overdueCount,
    ] = await Promise.all([
      supabaseAdmin
        .from('applications')
        .select('*, drivers(full_name,email,phone,status), vehicles(make,model,plate_number,weekly_rate,bond_amount)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('subscriptions')
        .select('*, drivers(full_name,email), vehicles(make,model,plate_number)')
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabaseAdmin
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed'),
    ]);

    response.json({
      summary: {
        pendingApplications: pendingCount.count || 0,
        activeSubscriptions: activeCount.count || 0,
        overduePayments: overdueCount.count || 0,
        vehicleInventory: vehicles.data?.length || 0,
      },
      pendingApplications: pendingApplications.data || [],
      vehicles: vehicles.data || [],
      recentSubscriptions: subscriptions.data || [],
      recentPayments: payments.data || [],
      notifications: notifications.data || [],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/applications/:applicationId/approve', async (request, response, next) => {
  try {
    const { applicationId } = z.object({ applicationId: z.string().uuid() }).parse(request.params);
    const result = await approveApplication({
      applicationId,
      approvedBy: request.user.authUserId,
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/applications/:applicationId/reject', async (request, response, next) => {
  try {
    const { applicationId } = z.object({ applicationId: z.string().uuid() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().min(5).max(500) }).parse(request.body);
    const application = await rejectApplication({ applicationId, reason });
    response.json({ application });
  } catch (error) {
    next(error);
  }
});

export default router;
