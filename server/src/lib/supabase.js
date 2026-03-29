import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  clientOptions,
);

export const supabaseAuth = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  clientOptions,
);

export const createSignedStorageUrl = async (bucket, path, expiresIn = 60 * 60) => {
  if (!path) {
    return null;
  }

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    throw error;
  }

  return data.signedUrl;
};
