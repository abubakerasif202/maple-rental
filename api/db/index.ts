import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are missing!');
  } else {
    console.warn('WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are missing. Creating a dummy client.');
  }
}

// Create a singleton client for the entire application.
// In a serverless environment, this instance may be reused across multiple requests.
// Using Service Role Key as this is the backend API handling all logic directly.
export const db = createClient(supabaseUrl || 'https://dummy.supabase.co', supabaseKey || 'dummy');

export const initializeDB = async () => {
  // With Supabase, schema initialization and seeding should ideally be done via 
  // the Supabase Dashboard SQL Editor using the provided supabase-schema.sql script.

  // We can still do a runtime check if needed, but it's generally avoided in serverless/backend
  // initialization to prevent race conditions.
  console.log('Database connection initialized with Supabase.');
};

export default db;
