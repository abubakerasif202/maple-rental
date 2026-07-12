const paginationFields = ['page', 'pageSize', 'totalItems', 'totalPages'];

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const assertRecord = (value, label) => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
};

const assertNumber = (value, field) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
};

const assertArray = (value, field) => {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
};

const assertPagination = (body) => {
  for (const field of paginationFields) {
    assertNumber(body[field], field);
  }
};

export const validateLoginResponse = ({ status, contentType, cookieJarText }) => {
  if (status !== 200) {
    throw new Error(`admin login failed with HTTP ${status}`);
  }

  if (!String(contentType || '').toLowerCase().includes('application/json')) {
    throw new Error('admin login returned a non-JSON response');
  }

  if (!String(cookieJarText || '').includes('admin_token')) {
    throw new Error('admin login did not establish an admin session cookie');
  }

  return { assertions: ['HTTP 200', 'JSON content type', 'admin session cookie present'] };
};

export const validateSmokeResponse = ({ endpoint, status, contentType, body }) => {
  if (status !== 200) {
    throw new Error(`${endpoint} returned HTTP ${status}`);
  }

  if (!String(contentType || '').toLowerCase().includes('application/json')) {
    throw new Error(`${endpoint} returned a non-JSON response`);
  }

  let parsed;
  try {
    parsed = JSON.parse(String(body || ''));
  } catch {
    throw new Error(`${endpoint} returned malformed JSON`);
  }

  assertRecord(parsed, `${endpoint} response`);

  switch (endpoint) {
    case 'rentals':
    case 'applications':
      assertArray(parsed.items, 'items');
      assertPagination(parsed);
      return {
        assertions: ['HTTP 200', 'JSON response', 'items array', 'pagination metadata'],
      };
    case 'financials':
      for (const field of ['total_applications', 'active_rentals', 'total_weekly_income']) {
        assertNumber(parsed[field], field);
      }
      return { assertions: ['HTTP 200', 'JSON response', 'numeric financial summary'] };
    case 'toll-notices':
      assertArray(parsed.items, 'items');
      return { assertions: ['HTTP 200', 'JSON response', 'items array'] };
    case 'maintenance':
      assertRecord(parsed.counts, 'counts');
      assertRecord(parsed.preserved, 'preserved');
      if (parsed.dryRun !== true) {
        throw new Error('maintenance response is not marked as a dry run');
      }
      return { assertions: ['HTTP 200', 'JSON response', 'counts object', 'dry-run marker'] };
    default:
      throw new Error(`unknown smoke endpoint ${endpoint}`);
  }
};

const readOption = (args, name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (process.argv[1]?.endsWith('productionAdminSmokeValidation.mjs')) {
  const args = process.argv.slice(2);
  const endpoint = readOption(args, '--endpoint');
  const status = Number(readOption(args, '--status'));
  const contentType = readOption(args, '--content-type') || '';
  const inputPath = readOption(args, '--input');

  try {
    if (!endpoint || !inputPath || !Number.isFinite(status)) {
      throw new Error('validator arguments are incomplete');
    }

    const { readFileSync } = await import('node:fs');
    const result = validateSmokeResponse({
      endpoint,
      status,
      contentType,
      body: readFileSync(inputPath, 'utf8'),
    });
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stderr.write(`response validation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  }
}
