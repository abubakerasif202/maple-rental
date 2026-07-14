import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

type PoolClient = import('pg').PoolClient;
export type PostgresConnectionMode = 'none' | 'session' | 'transaction';
export type DirectDatabaseConfigSource = 'DATABASE_URL' | 'SUPABASE_DB_URL' | null;
export type DirectDatabaseConfig = {
  connectionString: string;
  mode: PostgresConnectionMode;
  source: DirectDatabaseConfigSource;
};

const REQUIRED_PAYMENT_SCHEMA_COLUMNS: Record<string, string[]> = {
  applications: [
    'id',
    'status',
    'approved_bond',
    'approved_weekly_price',
    'payment_link_version',
    'pending_checkout_session_id',
    'paid_at',
  ],
  rentals: [
    'id',
    'application_id',
    'vehicle_registration',
    'status',
    'weekly_price',
    'bond_paid',
    'stripe_subscription_id',
    'stripe_customer_id',
    'stripe_status_event_created_at',
    'stripe_status_event_id',
    'stripe_status_event_terminal',
  ],
  stripe_webhook_events: [
    'id',
    'application_id',
    'stripe_event_id',
    'event_type',
    'status',
    'received_at',
    'updated_at',
    'processed_at',
    'stripe_subscription_id',
  ],
};

const { Pool } = pg;

let postgresPool: InstanceType<typeof Pool> | null = null;
let postgresPoolConnectionString: string | null = null;
const advisoryLockClientContext = new AsyncLocalStorage<PoolClient>();

const readConfiguredConnectionString = (key: 'DATABASE_URL' | 'SUPABASE_DB_URL') =>
  (process.env[key] || '').trim();

const readConfiguredPoolSize = () => {
  const rawValue = (process.env.DB_POOL_SIZE || '').trim();
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  if (
    !Number.isInteger(parsedValue) ||
    parsedValue <= 0 ||
    parsedValue > 100
  ) {
    console.warn(
      'Ignoring invalid DB_POOL_SIZE value; using the default PostgreSQL pool size instead.'
    );
    return null;
  }

  return parsedValue;
};

export const getDirectDatabaseConfig = (): DirectDatabaseConfig => {
  const databaseUrl = readConfiguredConnectionString('DATABASE_URL');
  const supabaseDbUrl = readConfiguredConnectionString('SUPABASE_DB_URL');
  const connectionString = databaseUrl || supabaseDbUrl;
  const source: DirectDatabaseConfigSource = databaseUrl
    ? 'DATABASE_URL'
    : supabaseDbUrl
      ? 'SUPABASE_DB_URL'
      : null;

  return {
    connectionString,
    mode: inferPostgresConnectionMode(connectionString),
    source,
  };
};

export const getDirectDatabaseConnectionString = () =>
  getDirectDatabaseConfig().connectionString;

const isPrivatePostgresHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized.startsWith('127.') ||
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    normalized.endsWith('.internal') ||
    /^dpg-[a-z0-9-]+$/.test(normalized)
  ) {
    return true;
  }

  const match = normalized.match(/^172\.(\d{1,3})\./);
  const secondOctet = Number(match?.[1]);
  return Boolean(match) && secondOctet >= 16 && secondOctet <= 31;
};

const POSTGRES_SSL_QUERY_PARAMETERS = [
  'ssl',
  'sslcert',
  'sslkey',
  'sslmode',
  'sslrootcert',
  'uselibpqcompat',
] as const;

export const getSecurePostgresConnectionOptions = (connectionString: string) => {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('PostgreSQL connection string must be a valid URL.');
  }

  if (isPrivatePostgresHostname(url.hostname)) {
    return { connectionString };
  }

  const sslMode = (url.searchParams.get('sslmode') || '').toLowerCase();
  if (sslMode === 'disable' || sslMode === 'no-verify') {
    throw new Error('External PostgreSQL connections must use certificate-verified TLS.');
  }

  // node-postgres lets connection-string SSL parameters replace the explicit
  // SSL object, so remove them before enforcing the verified configuration.
  for (const parameter of POSTGRES_SSL_QUERY_PARAMETERS) {
    url.searchParams.delete(parameter);
  }

  const ca = (process.env.DATABASE_SSL_CA || '').replace(/\\n/g, '\n').trim();
  return {
    connectionString: url.toString(),
    ssl: {
      ...(ca ? { ca } : {}),
      rejectUnauthorized: true as const,
    },
  };
};

const inferPostgresConnectionMode = (
  connectionString: string
): PostgresConnectionMode => {
  if (!connectionString) {
    return 'none';
  }

  try {
    const url = new URL(connectionString);
    // Only treat Supabase pooler hosts as transaction-mode on 6543.
    // Non-Supabase hosts may legitimately expose session-capable connections on that port.
    const isSupabasePoolerHost = url.hostname.endsWith('.pooler.supabase.com');
    return isSupabasePoolerHost && url.port === '6543' ? 'transaction' : 'session';
  } catch {
    const normalized = connectionString.trim();
    const isSupabaseTransactionPoolerDsn =
      /^postgres(?:ql)?:\/\/(?:[^@\s/]+@)?[^:\s/]+\.pooler\.supabase\.com:6543(?:\/|$)/i.test(
        normalized
      );

    return isSupabaseTransactionPoolerDsn ? 'transaction' : 'session';
  }
};

const getSupabaseProjectRefFromApiUrl = (supabaseUrl: string) => {
  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
};

const getSupabaseProjectRefFromPostgresUrl = (connectionString: string) => {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname.toLowerCase();
    const directMatch = hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/);
    if (directMatch?.[1]) {
      return directMatch[1];
    }

    if (hostname.endsWith('.pooler.supabase.com')) {
      const username = decodeURIComponent(url.username);
      const poolerMatch = username.match(/^postgres\.([a-z0-9-]+)$/i);
      return poolerMatch?.[1]?.toLowerCase() || null;
    }

    return null;
  } catch {
    return null;
  }
};

export const getDirectDatabaseAlignmentIssue = () => {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const { connectionString } = getDirectDatabaseConfig();
  if (!connectionString) {
    return null;
  }

  const apiProjectRef = getSupabaseProjectRefFromApiUrl(
    (process.env.SUPABASE_URL || '').trim()
  );
  const postgresProjectRef = getSupabaseProjectRefFromPostgresUrl(connectionString);

  if (!apiProjectRef) {
    return 'SUPABASE_URL must identify the authoritative Supabase project.';
  }

  if (!postgresProjectRef || postgresProjectRef !== apiProjectRef) {
    return (
      'The direct PostgreSQL connection must target the same Supabase project as SUPABASE_URL. ' +
      'A separate Render Postgres database would split application and payment state.'
    );
  }

  return null;
};

export const getPostgresConnectionMode = () => getDirectDatabaseConfig().mode;

export const hasDirectDatabaseConnection = () =>
  getPostgresConnectionMode() === 'session' && !getDirectDatabaseAlignmentIssue();

export const getSessionModePostgresRequirementIssue = () => {
  const { mode, source } = getDirectDatabaseConfig();

  const alignmentIssue = getDirectDatabaseAlignmentIssue();
  if (alignmentIssue) {
    return alignmentIssue;
  }

  if (mode === 'session') {
    return null;
  }

  if (mode === 'none') {
    return (
      'DATABASE_URL or SUPABASE_DB_URL must be configured with a session-capable ' +
      'Postgres connection before production payment processing starts.'
    );
  }

  const sourceName = source || 'the direct Postgres URL';
  return (
    `${sourceName} is configured for transaction-mode Postgres. ` +
    'Checkout and webhook payment activation use advisory locks and direct transactions, ' +
    'so production must use a direct connection or Supabase session pooler on port 5432, not transaction pooler port 6543.'
  );
};

const checkPaymentActivationSchema = async (client: PoolClient) => {
  const requiredTables = Object.keys(REQUIRED_PAYMENT_SCHEMA_COLUMNS);
  const { rows } = await client.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [requiredTables]
  );
  const availableColumns = new Set(
    rows.map(
      (row: { table_name: string; column_name: string }) =>
        `${row.table_name}.${row.column_name}`
    )
  );
  const issues: string[] = [];

  for (const [table, columns] of Object.entries(REQUIRED_PAYMENT_SCHEMA_COLUMNS)) {
    for (const column of columns) {
      const key = `${table}.${column}`;
      if (!availableColumns.has(key)) {
        issues.push(`missing ${key}`);
      }
    }
  }

  return issues;
};

const getPostgresPool = () => {
  const { connectionString, mode: connectionMode } = getDirectDatabaseConfig();
  const configuredPoolSize = readConfiguredPoolSize();

  if (connectionMode === 'none') {
    throw new Error(
      'DATABASE_URL (preferred) or SUPABASE_DB_URL is required for transactional data operations.'
    );
  }

  if (postgresPool && postgresPoolConnectionString !== connectionString) {
    void postgresPool.end().catch((error) => {
      console.error('Failed to recycle PostgreSQL pool after configuration change:', error);
    });
    postgresPool = null;
    postgresPoolConnectionString = null;
  }

  if (!postgresPool) {
    // When using Supabase Transaction Pooler (port 6543), we optimize for high concurrency.
    // Note: Session-based features like pg_advisory_lock() are not reliable in transaction mode.
    // Session mode holds connections longer, especially around advisory locks, so tune DB_POOL_SIZE
    // against your Supabase pool limits and Render instance count in production.
    const secureConnection = getSecurePostgresConnectionOptions(connectionString);
    postgresPool = new Pool({
      ...secureConnection,
      max:
        configuredPoolSize ?? (connectionMode === 'transaction' ? 20 : 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    postgresPoolConnectionString = connectionString;
  }

  return postgresPool;
};

export const checkDirectDatabaseHealth = async () => {
  const config = getDirectDatabaseConfig();
  const alignmentIssue = getDirectDatabaseAlignmentIssue();
  if (!config.source) {
    return {
      configured: false,
      mode: config.mode,
      schemaIssues: [] as string[],
      source: config.source,
    };
  }

  if (alignmentIssue) {
    return {
      configured: true,
      mode: config.mode,
      schemaIssues: [alignmentIssue],
      source: config.source,
    };
  }

  if (config.mode !== 'session') {
    return {
      configured: true,
      mode: config.mode,
      schemaIssues: [] as string[],
      source: config.source,
    };
  }

  const client = await getPostgresPool().connect();

  try {
    await client.query('SELECT 1');
    const schemaIssues = await checkPaymentActivationSchema(client);

    return {
      configured: true,
      mode: config.mode,
      schemaIssues,
      source: config.source,
    };
  } finally {
    client.release();
  }
};

export const withPostgresTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
) => {
  const contextualClient = advisoryLockClientContext.getStore();
  const client = contextualClient || (await getPostgresPool().connect());

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    let rollbackSucceeded: boolean | null = null;
    let rollbackErrorCode: string | null = null;

    try {
      await client.query('ROLLBACK');
      rollbackSucceeded = true;
    } catch (rollbackError) {
      rollbackSucceeded = false;
      rollbackErrorCode =
        rollbackError && typeof rollbackError === 'object' && 'code' in rollbackError
          ? String((rollbackError as { code?: unknown }).code || null)
          : null;
      console.error('Failed to rollback PostgreSQL transaction:', rollbackError);
    }

    if (error && typeof error === 'object') {
      Object.assign(error as Record<string, unknown>, {
        rollbackSucceeded,
        rollbackErrorCode,
      });
    }

    throw error;
  } finally {
    if (!contextualClient) {
      client.release();
    }
  }
};

const toAdvisoryLockKeyParts = (lockKey: string): [number, number] => {
  const digest = crypto.createHash('sha256').update(lockKey).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
};

export const withPostgresAdvisoryLock = async <T>(
  lockKey: string,
  callback: () => Promise<T>
) => {
  const pool = getPostgresPool();
  const { mode: connectionMode } = getDirectDatabaseConfig();

  if (connectionMode === 'transaction') {
    throw new Error(
      'PostgreSQL advisory locks are not supported when using a transaction-mode pooler (port 6543). ' +
        'Please use a direct connection or session-mode pooler (port 5432) for this operation.'
    );
  }

  const client = await pool.connect();
  const [keyPartOne, keyPartTwo] = toAdvisoryLockKeyParts(lockKey);
  let releaseReason: Error | boolean | undefined;
  let lockAcquired = false;

  try {
    const result = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      [keyPartOne, keyPartTwo]
    );
    lockAcquired = result.rows[0]?.acquired === true;
    if (!lockAcquired) {
      throw Object.assign(
        new Error('This operation is already being processed. Please retry shortly.'),
        { status: 409 }
      );
    }

    return await advisoryLockClientContext.run(client, callback);
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [
          keyPartOne,
          keyPartTwo,
        ]);
      }
    } catch (unlockError) {
      releaseReason = unlockError instanceof Error ? unlockError : true;
      console.error('Failed to release PostgreSQL advisory lock:', unlockError);
    }

    if (releaseReason) {
      client.release(releaseReason);
    } else {
      client.release();
    }
  }
};

export const closePostgresPool = async () => {
  if (!postgresPool) {
    return;
  }

  const pool = postgresPool;
  postgresPool = null;
  postgresPoolConnectionString = null;
  await pool.end();
};
