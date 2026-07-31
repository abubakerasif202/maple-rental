import crypto from 'node:crypto';

import { readSheet } from 'read-excel-file/node';

export const FLEET_IMPORT_MAX_FILE_SIZE = 2 * 1024 * 1024;
export const FLEET_IMPORT_MAX_ROWS = 1_000;
export const FLEET_IMPORT_MAX_COLUMNS = 20;

export type FleetImportSourceType = 'csv' | 'xlsx';

export type FleetParsedRow = {
  sourceRowNumber: number;
  driverNameOriginal: string | null;
  driverNameNormalized: string | null;
  vehicleRegistrationOriginal: string;
  vehicleRegistrationNormalized: string;
  makeOriginal: string;
  makeNormalized: string;
  modelOriginal: string;
  modelNormalized: string;
  weeklyRate: number;
  snapshotDate: string;
  sourceNotes: string | null;
  validationStatus: 'ready' | 'needs_review';
  validationErrors: string[];
  validationWarnings: string[];
};

export type FleetParseResult = {
  rows: FleetParsedRow[];
  summary: {
    snapshotDate: string;
    totalRows: number;
    totalWeeklyRate: number;
    averageWeeklyRate: number;
    readyRows: number;
    reviewRows: number;
    modelBreakdown: Record<string, { count: number; totalWeeklyRate: number }>;
  };
};

type Cell = Date | boolean | number | string | null;

const REQUIRED_HEADERS = ['driver', 'rego', 'make', 'model', 'weekly rate', 'date'];

const cleanText = (value: Cell | undefined) => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  return text || null;
};

export const normalizeFleetRegistration = (value: string | null | undefined) =>
  (value || '').trim().toUpperCase().replace(/\s+/g, '');

export const normalizeFleetDriverName = (value: string | null) =>
  value ? value.trim().replace(/\s+/g, ' ') : null;

export type FleetStagedRowValidationInput = {
  driver_name_original: string | null;
  vehicle_registration_original: string;
  vehicle_registration_normalized: string;
  make_original: string;
  model_original: string;
  weekly_rate: number | string;
  snapshot_date: string | Date;
  source_notes: string | null;
  review_acknowledged_at?: string | Date | null;
};

export const validateFleetStagedRow = (
  row: FleetStagedRowValidationInput,
  duplicateRegistration = false,
  expectedSnapshotDate?: string
) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const registration = normalizeFleetRegistration(String(row.vehicle_registration_original || ''));
  const snapshotDate = toDateOnly(row.snapshot_date);

  if (!registration) errors.push('Vehicle registration is required.');
  if (!String(row.make_original || '').trim()) errors.push('Make is required.');
  if (!String(row.model_original || '').trim()) errors.push('Model is required.');
  if (!(Number(row.weekly_rate) > 0 && Number(row.weekly_rate) <= 10_000)) {
    errors.push('Weekly rate must be greater than zero and no more than $10,000.');
  }
  if (!snapshotDate) errors.push('Snapshot date must be a valid YYYY-MM-DD date.');
  else if (expectedSnapshotDate && snapshotDate !== expectedSnapshotDate) errors.push('Snapshot date must match the import snapshot date.');
  if (!normalizeFleetDriverName(row.driver_name_original)) {
    warnings.push('Driver name is missing; admin review is required.');
  }
  if (registration === 'COSWY') warnings.push('Custom-style registration must be verified by an admin.');
  if (registration === 'FTG15R') {
    if (Number(row.weekly_rate) !== 257 || !row.source_notes?.toUpperCase().includes('RTO')) {
      errors.push('FTG15R must retain the $257 interpretation and RTO source note.');
    } else {
      warnings.push('Source contained 257RTO; $257 is proposed and RTO is retained in notes.');
    }
  }
  if (duplicateRegistration) errors.push('Duplicate registration in this import.');

  return {
    validationErrors: errors,
    validationWarnings: warnings,
    validationStatus: errors.length || (warnings.length && !row.review_acknowledged_at)
      ? 'needs_review' as const
      : 'ready' as const,
  };
};

export const assertMutableFleetImportRow = ({
  importStatus,
  rowApplyStatus,
}: {
  importStatus: string;
  rowApplyStatus: string;
}) => {
  if (['cancelled', 'applied', 'failed'].includes(importStatus)) {
    throw Object.assign(new Error(`Fleet imports in ${importStatus} status cannot be changed.`), { status: 409 });
  }
  if (rowApplyStatus !== 'pending') {
    throw Object.assign(new Error(`Fleet rows in ${rowApplyStatus} status cannot be changed.`), { status: 409 });
  }
};

export const getFleetDryRunValidationConflict = (validationStatus: string) =>
  validationStatus === 'ready' ? null : 'Row still needs review.';

export const assertFleetRentalRegistrationMatch = (
  importedRegistration: string,
  authoritativeRegistration: string
) => {
  const imported = normalizeFleetRegistration(importedRegistration);
  const authoritative = normalizeFleetRegistration(authoritativeRegistration);
  if (!imported || imported !== authoritative) {
    throw Object.assign(new Error('The selected rental registration does not match the imported registration.'), { status: 409 });
  }
};

export type FleetApplyPreviewRow = {
  rowId: string;
  rentalId: number;
  registration: string;
  existingWeeklyRate: number;
  proposedWeeklyRate: number;
  difference: number;
  snapshotDate: string;
};

export const buildFleetApplyAuditMetadata = (rows: FleetApplyPreviewRow[]) => ({
  count: rows.length,
  rows: rows.map((row) => ({
    fleetImportRowId: row.rowId,
    rentalId: row.rentalId,
    registration: row.registration,
    previousWeeklyRate: row.existingWeeklyRate,
    proposedWeeklyRate: row.proposedWeeklyRate,
    appliedWeeklyRate: row.proposedWeeklyRate,
    difference: row.difference,
    snapshotDate: row.snapshotDate,
  })),
});

const normalizeLabel = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export const toDateOnly = (value: Cell | undefined) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? text
    : null;
};

const parseCsv = (text: string): Cell[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
};

const validateFile = ({
  buffer,
  filename,
  mimetype,
}: {
  buffer: Buffer;
  filename: string;
  mimetype?: string;
}) => {
  if (!buffer.length) throw new Error('The fleet register file is empty.');
  if (buffer.length > FLEET_IMPORT_MAX_FILE_SIZE) {
    throw new Error(`Fleet register files must not exceed ${FLEET_IMPORT_MAX_FILE_SIZE} bytes.`);
  }

  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension !== 'xlsx' && extension !== 'csv') {
    throw new Error('Only .xlsx and .csv fleet register files are supported.');
  }
  if (extension === 'xlsx') {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error('The uploaded .xlsx file does not have valid ZIP container bytes.');
    }
    const accepted = new Set([
      'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
    if (mimetype && !accepted.has(mimetype)) throw new Error('The file MIME type does not match .xlsx.');
  } else {
    if (buffer.includes(0)) throw new Error('CSV files must contain text, not binary data.');
    const accepted = new Set(['application/csv', 'application/octet-stream', 'text/csv', 'text/plain']);
    if (mimetype && !accepted.has(mimetype)) throw new Error('The file MIME type does not match .csv.');
  }
  return extension as FleetImportSourceType;
};

const locateHeader = (data: Cell[][]) => {
  const index = data.findIndex((row) => {
    const headers = row.map((value) => (cleanText(value) || '').toLowerCase());
    return REQUIRED_HEADERS.every((header) => headers.includes(header));
  });
  if (index < 0) throw new Error(`Missing required columns: ${REQUIRED_HEADERS.join(', ')}.`);
  const headers = data[index].map((value) => (cleanText(value) || '').toLowerCase());
  return { headerIndex: index, headers };
};

export const parseFleetRegister = async ({
  buffer,
  filename,
  mimetype,
}: {
  buffer: Buffer;
  filename: string;
  mimetype?: string;
}): Promise<FleetParseResult & { checksum: string; sourceType: FleetImportSourceType }> => {
  const sourceType = validateFile({ buffer, filename, mimetype });
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  let data: Cell[][];

  if (sourceType === 'xlsx') {
    data = (await readSheet(buffer, 'Fleet Register')) as Cell[][];
  } else {
    data = parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  }

  if (!data.length) throw new Error('The fleet register contains no rows.');
  if (data.some((row) => row.length > FLEET_IMPORT_MAX_COLUMNS)) {
    throw new Error(`Fleet registers must not exceed ${FLEET_IMPORT_MAX_COLUMNS} columns.`);
  }
  const { headerIndex, headers } = locateHeader(data);
  const column = (name: string) => headers.indexOf(name);
  const candidateRows = data.slice(headerIndex + 1).filter((row) =>
    row.some((value) => cleanText(value) != null)
  );
  if (!candidateRows.length) throw new Error('The fleet register contains no data rows.');
  if (candidateRows.length > FLEET_IMPORT_MAX_ROWS) {
    throw new Error(`Fleet registers must not exceed ${FLEET_IMPORT_MAX_ROWS} data rows.`);
  }

  const parsedDates = candidateRows.map((source) => toDateOnly(source[column('date')]));
  if (parsedDates.some((date) => !date)) {
    throw new Error('Every fleet row must contain a valid snapshot date in YYYY-MM-DD format.');
  }
  const snapshotDates = new Set(parsedDates as string[]);
  if (snapshotDates.size !== 1) throw new Error('Every fleet row in an import must use the same snapshot date.');
  const snapshotDate = parsedDates[0] as string;
  const registrationCounts = new Map<string, number>();
  for (const source of candidateRows) {
    const registration = normalizeFleetRegistration(cleanText(source[column('rego')]) || '');
    if (registration) registrationCounts.set(registration, (registrationCounts.get(registration) || 0) + 1);
  }
  const rows = candidateRows.map((source, rowIndex): FleetParsedRow => {
    const sourceRowNumber = headerIndex + rowIndex + 2;
    const driverNameOriginal = cleanText(source[column('driver')]);
    const vehicleRegistrationOriginal = cleanText(source[column('rego')]) || '';
    const makeOriginal = cleanText(source[column('make')]) || '';
    const modelOriginal = cleanText(source[column('model')]) || '';
    const weeklyRateValue = source[column('weekly rate')];
    const weeklyRate = typeof weeklyRateValue === 'number'
      ? weeklyRateValue
      : Number(String(weeklyRateValue ?? '').replace(/[$,\s]/g, ''));
    const sourceNotes = cleanText(source[column('notes')]);
    const sourceQuality = cleanText(source[column('data quality')]);
    const vehicleRegistrationNormalized = normalizeFleetRegistration(vehicleRegistrationOriginal);
    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];

    if (!vehicleRegistrationOriginal) validationErrors.push('Vehicle registration is required.');
    if (!makeOriginal) validationErrors.push('Make is required.');
    if (!modelOriginal) validationErrors.push('Model is required.');
    if (!Number.isFinite(weeklyRate) || weeklyRate <= 0 || weeklyRate > 10_000) {
      validationErrors.push('Weekly rate must be greater than zero and no more than $10,000.');
    }
    if (!driverNameOriginal) validationWarnings.push('Driver name is missing; admin review is required.');
    if (vehicleRegistrationNormalized === 'COSWY') {
      validationWarnings.push('Custom-style registration must be verified by an admin.');
    }
    if (vehicleRegistrationNormalized === 'FTG15R') {
      if (weeklyRate !== 257 || !sourceNotes?.toUpperCase().includes('RTO')) {
        validationErrors.push('FTG15R must retain the $257 interpretation and RTO source note.');
      } else {
        validationWarnings.push('Source contained 257RTO; $257 is proposed and RTO is retained in notes.');
      }
    }
    if (sourceQuality?.toLowerCase() === 'review' && validationWarnings.length === 0) {
      validationWarnings.push('The source marks this row for human review.');
    }
    if ((registrationCounts.get(vehicleRegistrationNormalized) || 0) > 1) {
      validationErrors.push('Duplicate registration in this import.');
    }

    return {
      sourceRowNumber,
      driverNameOriginal,
      driverNameNormalized: normalizeFleetDriverName(driverNameOriginal),
      vehicleRegistrationOriginal,
      vehicleRegistrationNormalized,
      makeOriginal,
      makeNormalized: normalizeLabel(makeOriginal),
      modelOriginal,
      modelNormalized: normalizeLabel(modelOriginal),
      weeklyRate,
      snapshotDate,
      sourceNotes,
      validationStatus:
        validationErrors.length || validationWarnings.length ? 'needs_review' : 'ready',
      validationErrors,
      validationWarnings,
    };
  });

  const modelBreakdown: FleetParseResult['summary']['modelBreakdown'] = {};
  for (const row of rows) {
    const entry = modelBreakdown[row.modelNormalized] || { count: 0, totalWeeklyRate: 0 };
    entry.count += 1;
    entry.totalWeeklyRate += row.weeklyRate;
    modelBreakdown[row.modelNormalized] = entry;
  }
  const totalWeeklyRate = rows.reduce((total, row) => total + row.weeklyRate, 0);
  const reviewRows = rows.filter((row) => row.validationStatus === 'needs_review').length;

  return {
    checksum,
    sourceType,
    rows,
    summary: {
      snapshotDate,
      totalRows: rows.length,
      totalWeeklyRate,
      averageWeeklyRate: totalWeeklyRate / rows.length,
      readyRows: rows.length - reviewRows,
      reviewRows,
      modelBreakdown,
    },
  };
};

export const escapeCsvFormula = (value: unknown) => {
  const text = value == null ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

export const toRejectedRowsCsv = (rows: Array<Record<string, unknown>>) => {
  const headers = [
    'source_row_number', 'driver', 'registration', 'make', 'model', 'weekly_rate',
    'snapshot_date', 'notes', 'validation_errors', 'validation_warnings', 'apply_status',
  ];
  const quote = (value: unknown) => `"${escapeCsvFormula(value).replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => quote(row[header])).join(',')),
  ].join('\r\n');
};
