import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const hasRequiredSupabaseEnv = Boolean(supabaseUrl && supabaseKey);

if (!hasRequiredSupabaseEnv) {
  const message = 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.';

  if (process.env.NODE_ENV === 'production') {
    console.error(`CRITICAL: ${message}`);
  } else {
    console.warn(`WARNING: ${message} Creating a dummy client for local development.`);
  }
}

const createScopedClient = (key: string) =>
  createClient(supabaseUrl || 'https://dummy.supabase.co', key || 'dummy', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

// Create a singleton client for privileged database operations only.
// Never use this client for user auth calls because auth methods can attach
// request-scoped credentials and cause later queries to run under RLS.
export const db = createScopedClient(supabaseKey);

// Use a fresh auth client per request so admin login/verification never mutates
// the singleton service-role client used by data routes.
export const createAuthClient = () => createScopedClient(supabaseAnonKey || supabaseKey);

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
