import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyProductionSchemaContract } from '../schemaContract.js';

type MapleSupabaseClient = SupabaseClient;

const readEnv = (key: string) => {
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeHttpUrl = (value: string) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

const supabaseUrlRaw = readEnv('SUPABASE_URL');
const supabaseUrl = normalizeHttpUrl(supabaseUrlRaw);
const supabaseServiceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey =
  readEnv('SUPABASE_ANON_KEY') || readEnv('SUPABASE_ANON_PUBLIC_KEY');

let serviceClient: MapleSupabaseClient | null = null;

const createScopedClient = (url: string, key: string) =>
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

const buildConfigurationErrorMessage = (
  issues: string[],
  context: 'admin' | 'auth'
) => {
  const prefix =
    context === 'admin'
      ? 'Supabase admin client is not configured correctly'
      : 'Supabase auth client is not configured correctly';

  return `${prefix}: ${issues.join(', ')}.`;
};

export const getSupabaseConfigurationIssues = () => {
  const issues: string[] = [];

  if (!supabaseUrlRaw) {
    issues.push('SUPABASE_URL');
  } else if (!supabaseUrl) {
    issues.push('SUPABASE_URL (must be a valid HTTP or HTTPS URL)');
  }

  if (!supabaseServiceRoleKey) {
    issues.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  return issues;
};

export const hasSupabaseAdminConfig = () =>
  getSupabaseConfigurationIssues().length === 0;

export const getSupabaseAuthConfigurationIssues = () => {
  const issues: string[] = [];

  if (!supabaseUrlRaw) {
    issues.push('SUPABASE_URL');
  } else if (!supabaseUrl) {
    issues.push('SUPABASE_URL (must be a valid HTTP or HTTPS URL)');
  }

  if (!supabaseAnonKey) {
    issues.push('SUPABASE_ANON_KEY');
  }

  return issues;
};

const getServiceClient = () => {
  const issues = getSupabaseConfigurationIssues();
  if (issues.length > 0 || !supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(buildConfigurationErrorMessage(issues, 'admin'));
  }

  if (!serviceClient) {
    serviceClient = createScopedClient(supabaseUrl, supabaseServiceRoleKey);
  }

  return serviceClient;
};

export const db = new Proxy({} as MapleSupabaseClient, {
  get(_target, property, receiver) {
    const client = getServiceClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const createAuthClient = () => {
  const issues = getSupabaseAuthConfigurationIssues();
  const authKey = supabaseAnonKey;

  if (issues.length > 0 || !supabaseUrl || !authKey) {
    throw new Error(buildConfigurationErrorMessage(issues, 'auth'));
  }

  return createScopedClient(supabaseUrl, authKey);
};

export const checkDBHealth = async () => {
  if (!hasSupabaseAdminConfig()) {
    const errorMessage = buildConfigurationErrorMessage(
      getSupabaseConfigurationIssues(),
      'admin'
    );

    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMessage);
    }

    return {
      configured: false,
      issues: getSupabaseConfigurationIssues(),
    };
  }

  const { error } = await getServiceClient()
    .from('applications')
    .select('id', { head: true })
    .limit(1);

  if (error) {
    throw new Error(`Supabase connectivity check failed: ${error.message || 'Unknown error'}`);
  }

  const issues: string[] = [];

  try {
    await verifyProductionSchemaContract();
  } catch (schemaContractError) {
    if (process.env.NODE_ENV !== 'production') {
      throw schemaContractError;
    }

    issues.push('schema_contract_validation_failed');
    console.warn(
      'Production schema contract validation failed during database health check; continuing with compatibility mode.',
      schemaContractError
    );
  }

  return {
    configured: true,
    issues,
  };
};

export const initializeDB = async () => {
  const { configured } = await checkDBHealth();

  if (!configured) {
    return;
  }

  console.log('Supabase admin data plane initialized for storage and auth-backed operations.');
};

export default db;
