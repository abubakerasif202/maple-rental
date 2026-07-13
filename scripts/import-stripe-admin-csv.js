import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
if (!connectionString) {
  console.error('Missing DATABASE_URL or SUPABASE_DB_URL environment variable.');
  process.exit(1);
}

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.split('=');
  if (key?.startsWith('--')) {
    args.set(key.slice(2), rest.join('='));
  }
}

const customersPath = args.get('customers');
const balancePath = args.get('balance');

if (!customersPath || !balancePath) {
  console.error(
    'Usage: node scripts/import-stripe-admin-csv.js --customers="C:\\path\\unified_customers.csv" --balance="C:\\path\\balance_history.csv"',
  );
  process.exit(1);
}

const readCsv = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }

      row.push(field);
      field = '';
      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== '')) {
      rows.push(row);
    }
  }

  const [headers = [], ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), record[index]?.trim() || ''])),
  );
};

const nullable = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
};

const decimal = (value, fallback = null) => {
  const normalized = String(value ?? '').replace(/[$,]/g, '').trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const timestamp = (value) => {
  const trimmed = nullable(value);
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(`${trimmed.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const migrationSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'migrations', '20260714033000_stripe_csv_imports.sql'),
  'utf8',
);

const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(migrationSql);

  const customerRows = readCsv(customersPath);
  let importedCustomers = 0;
  for (const row of customerRows) {
    const externalId = nullable(row.id);
    const fullName = nullable(row.Name) || nullable(row.Email) || externalId;
    if (!externalId || !fullName) {
      continue;
    }

    await client.query(
      `
        INSERT INTO customers (
          external_id,
          full_name,
          preferred_name,
          email,
          street,
          city,
          postcode,
          state,
          source,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $2, $3, $4, $5, $6, $7, 'stripe-customer-export', COALESCE($8::timestamptz, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT (external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          preferred_name = EXCLUDED.preferred_name,
          email = EXCLUDED.email,
          street = EXCLUDED.street,
          city = EXCLUDED.city,
          postcode = EXCLUDED.postcode,
          state = EXCLUDED.state,
          source = EXCLUDED.source,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        externalId,
        fullName,
        nullable(row.Email),
        nullable(row['Address Line1']),
        nullable(row['Address City']),
        nullable(row['Address Postal Code']),
        nullable(row['Address Country']),
        timestamp(row['Created (UTC)']),
      ],
    );
    importedCustomers += 1;
  }

  const balanceRows = readCsv(balancePath);
  let importedBalanceTransactions = 0;
  for (const row of balanceRows) {
    const id = nullable(row.id);
    const createdAt = timestamp(row['Created (UTC)']);
    if (!id || !createdAt) {
      continue;
    }

    await client.query(
      `
        INSERT INTO stripe_balance_transactions (
          id,
          type,
          source,
          amount,
          fee,
          destination_platform_fee,
          destination_platform_fee_currency,
          net,
          currency,
          created_at,
          available_on,
          description,
          customer_facing_amount,
          customer_facing_currency,
          transfer,
          transfer_date,
          transfer_group
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, LOWER($9), $10, $11, $12, $13, LOWER($14), $15, $16, $17)
        ON CONFLICT (id)
        DO UPDATE SET
          type = EXCLUDED.type,
          source = EXCLUDED.source,
          amount = EXCLUDED.amount,
          fee = EXCLUDED.fee,
          destination_platform_fee = EXCLUDED.destination_platform_fee,
          destination_platform_fee_currency = EXCLUDED.destination_platform_fee_currency,
          net = EXCLUDED.net,
          currency = EXCLUDED.currency,
          created_at = EXCLUDED.created_at,
          available_on = EXCLUDED.available_on,
          description = EXCLUDED.description,
          customer_facing_amount = EXCLUDED.customer_facing_amount,
          customer_facing_currency = EXCLUDED.customer_facing_currency,
          transfer = EXCLUDED.transfer,
          transfer_date = EXCLUDED.transfer_date,
          transfer_group = EXCLUDED.transfer_group,
          imported_at = CURRENT_TIMESTAMP
      `,
      [
        id,
        nullable(row.Type) || 'unknown',
        nullable(row.Source),
        decimal(row.Amount, 0),
        decimal(row.Fee),
        decimal(row['Destination Platform Fee']),
        nullable(row['Destination Platform Fee Currency']),
        decimal(row.Net, 0),
        nullable(row.Currency) || 'aud',
        createdAt,
        timestamp(row['Available On (UTC)']),
        nullable(row.Description),
        decimal(row['Customer Facing Amount']),
        nullable(row['Customer Facing Currency']),
        nullable(row.Transfer),
        timestamp(row['Transfer Date (UTC)']),
        nullable(row['Transfer Group']),
      ],
    );
    importedBalanceTransactions += 1;
  }

  await client.query('COMMIT');
  console.log(`Imported ${importedCustomers} Stripe customers.`);
  console.log(`Imported ${importedBalanceTransactions} Stripe balance transactions.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('Stripe CSV import failed:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
