import fs from 'fs';
import path from 'path';

import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';

const getSecureConnectionOptions = (value) => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const private172Match = hostname.match(/^172\.(\d{1,3})\./);
  const private172Octet = Number(private172Match?.[1]);
  const privateHost =
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    (Boolean(private172Match) && private172Octet >= 16 && private172Octet <= 31) ||
    hostname.endsWith('.internal') ||
    !hostname.includes('.');

  if (privateHost) {
    return { connectionString: value };
  }

  const sslMode = (url.searchParams.get('sslmode') || '').toLowerCase();
  if (sslMode === 'disable' || sslMode === 'no-verify') {
    throw new Error('External PostgreSQL connections must use certificate-verified TLS.');
  }

  for (const parameter of ['ssl', 'sslcert', 'sslkey', 'sslmode', 'sslrootcert', 'uselibpqcompat']) {
    url.searchParams.delete(parameter);
  }

  const ca = (process.env.DATABASE_SSL_CA || '').replace(/\\n/g, '\n').trim();
  return {
    connectionString: url.toString(),
    ssl: { ...(ca ? { ca } : {}), rejectUnauthorized: true },
  };
};

if (!connectionString) {
  console.error('Missing DATABASE_URL or SUPABASE_DB_URL environment variable.');
  process.exit(1);
}

const client = new Client(getSecureConnectionOptions(connectionString));

async function runMigration() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL using the provided connection string.');

    const migrationFiles = [
      '20260326111500_ensure_stripe_webhook_event_ledger.sql',
      '20260419090000_add_stripe_webhook_v3_columns.sql',
    ];

    for (const migrationFile of migrationFiles) {
      const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', migrationFile);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      console.log(`Executing supabase/migrations/${migrationFile}...`);
      await client.query(sql);
    }

    console.log('Stripe webhook ledger migrations applied successfully.');
  } catch (error) {
    console.error('Error applying Stripe webhook ledger migration:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runMigration();
