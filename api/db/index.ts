import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const hasRequiredSupabaseEnv = Boolean(supabaseUrl && supabaseKey);

if (!hasRequiredSupabaseEnv) {
  const message = 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.';

  if (process.env.NODE_ENV === 'production') {
    console.error(`CRITICAL: ${message}`);
  } else {
    console.warn(`WARNING: ${message} Creating a dummy client for local development.`);
  }
}

// Create a singleton client for the entire application.
// Using the Service Role Key because the backend API handles privileged operations.
export const db = createClient(supabaseUrl || 'https://dummy.supabase.co', supabaseKey || 'dummy');

export const initializeDB = async () => {
  if (!hasRequiredSupabaseEnv) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }
    return;
  }

  console.log('Database connection initialized with Supabase.');
};

export default db;
