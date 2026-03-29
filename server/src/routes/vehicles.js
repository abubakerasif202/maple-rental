import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

router.get('/', async (_request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    response.json({
      vehicles: data || [],
    });
  } catch (error) {
    next(error);
  }
});

export default router;
