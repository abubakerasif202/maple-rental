import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertFleetRentalRegistrationMatch,
  assertMutableFleetImportRow,
  buildFleetApplyAuditMetadata,
  FLEET_IMPORT_MAX_FILE_SIZE,
  normalizeFleetDriverName,
  normalizeFleetRegistration,
  getFleetDryRunValidationConflict,
  parseFleetRegister,
  toRejectedRowsCsv,
  validateFleetStagedRow,
} from './fleetImportService.js';

const workbookPath = path.resolve('Maple_Rentals_Fleet_Register_30-09-2026.xlsx');

describe('fleet register parser', () => {
  it.skipIf(!fs.existsSync(workbookPath))('parses the supplied 51-row workbook without changing source values', async () => {
    const result = await parseFleetRegister({
      buffer: fs.readFileSync(workbookPath),
      filename: path.basename(workbookPath),
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    expect(result.summary).toMatchObject({ totalRows: 51, totalWeeklyRate: 13_982, reviewRows: 5 });
    expect(result.summary.averageWeeklyRate).toBeCloseTo(274.16, 2);
    expect(result.summary.modelBreakdown).toEqual({
      Camry: { count: 38, totalWeeklyRate: 10_527 },
      Corolla: { count: 5, totalWeeklyRate: 980 },
      Jolion: { count: 7, totalWeeklyRate: 2_115 },
      Tarago: { count: 1, totalWeeklyRate: 360 },
    });
    expect(result.rows.filter((row) => !row.driverNameOriginal)).toHaveLength(3);
    expect(result.rows.find((row) => row.vehicleRegistrationNormalized === 'FTG15R')).toMatchObject({
      vehicleRegistrationOriginal: 'FTG15R', weeklyRate: 257, sourceNotes: expect.stringContaining('RTO'),
    });
    expect(result.rows.find((row) => row.vehicleRegistrationNormalized === 'COSWY')).toMatchObject({
      vehicleRegistrationOriginal: 'COSWY', validationStatus: 'needs_review',
    });
    expect(new Set(result.rows.map((row) => row.snapshotDate))).toEqual(new Set(['2026-09-30']));
  });

  it('normalizes registrations conservatively and retains originals', async () => {
    const csv = Buffer.from('Driver,Rego,Make,Model,Weekly Rate,Date,Notes,Data Quality\nSam, ab 12 cd ,Toyota,Camry,250,2026-09-30,,OK');
    const result = await parseFleetRegister({ buffer: csv, filename: 'fleet.csv', mimetype: 'text/csv' });
    expect(normalizeFleetRegistration(' ab 12 cd ')).toBe('AB12CD');
    expect(result.rows[0]).toMatchObject({
      vehicleRegistrationOriginal: 'ab 12 cd', vehicleRegistrationNormalized: 'AB12CD',
    });
  });

  it.each([
    ['fleet.exe', 'text/plain', Buffer.from('x'), 'Only .xlsx and .csv'],
    ['fleet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from('not zip'), 'valid ZIP'],
    ['fleet.csv', 'text/csv', Buffer.alloc(FLEET_IMPORT_MAX_FILE_SIZE + 1), 'must not exceed'],
    ['fleet.csv', 'text/csv', Buffer.from('Driver,Rego\nSam,ABC'), 'Missing required columns'],
    ['fleet.csv', 'text/csv', Buffer.from('Driver,Rego,Make,Model,Weekly Rate,Date\n'), 'contains no data rows'],
  ])('rejects invalid input %s', async (filename, mimetype, buffer, message) => {
    await expect(parseFleetRegister({ filename, mimetype, buffer })).rejects.toThrow(message);
  });

  it('does not execute formula-looking CSV values and sanitizes rejected-row exports', async () => {
    const csv = Buffer.from('Driver,Rego,Make,Model,Weekly Rate,Date,Notes\n"=HYPERLINK(""x"")",ABC123,Toyota,Camry,250,2026-09-30,+cmd');
    const parsed = await parseFleetRegister({ buffer: csv, filename: 'fleet.csv', mimetype: 'text/csv' });
    expect(parsed.rows[0].driverNameOriginal).toBe('=HYPERLINK("x")');
    const exported = toRejectedRowsCsv([{ driver: '=2+2', notes: '@cmd', weekly_rate: '-1' }]);
    expect(exported).toContain("'=2+2");
    expect(exported).toContain("'@cmd");
    expect(exported).toContain("'-1");
  });

  it('flags duplicate registrations without silently dropping either source row', async () => {
    const csv = Buffer.from('Driver,Rego,Make,Model,Weekly Rate,Date\nA,AB 12,Toyota,Camry,250,2026-09-30\nB,AB12,Toyota,Camry,260,2026-09-30');
    const result = await parseFleetRegister({ buffer: csv, filename: 'fleet.csv', mimetype: 'text/csv' });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].validationErrors).toContain('Duplicate registration in this import.');
    expect(result.rows[1].validationErrors).toContain('Duplicate registration in this import.');
    expect(result.rows.every((row) => row.validationStatus === 'needs_review')).toBe(true);
    expect(result.rows.map((row) => getFleetDryRunValidationConflict(row.validationStatus))).toEqual([
      'Row still needs review.', 'Row still needs review.',
    ]);
  });

  it('accepts a consistent future date and rejects mixed snapshot dates', async () => {
    const future = Buffer.from('Driver,Rego,Make,Model,Weekly Rate,Date\nA,ABC1,Toyota,Camry,250,2027-10-06\nB,ABC2,Toyota,Camry,260,2027-10-06');
    const parsed = await parseFleetRegister({ buffer: future, filename: 'future.csv', mimetype: 'text/csv' });
    expect(parsed.summary.snapshotDate).toBe('2027-10-06');
    expect(new Set(parsed.rows.map((row) => row.snapshotDate))).toEqual(new Set(['2027-10-06']));

    const mixed = Buffer.from('Driver,Rego,Make,Model,Weekly Rate,Date\nA,ABC1,Toyota,Camry,250,2027-10-06\nB,ABC2,Toyota,Camry,260,2027-10-07');
    await expect(parseFleetRegister({ buffer: mixed, filename: 'mixed.csv', mimetype: 'text/csv' }))
      .rejects.toThrow('same snapshot date');
  });

  it.each(['', '2027-02-30', '06/10/2027', '2027-10-06T00:00:00Z'])(
    'rejects missing or malformed snapshot date %s',
    async (date) => {
      const csv = Buffer.from(`Driver,Rego,Make,Model,Weekly Rate,Date\nA,ABC1,Toyota,Camry,250,${date}`);
      await expect(parseFleetRegister({ buffer: csv, filename: 'bad-date.csv', mimetype: 'text/csv' }))
        .rejects.toThrow('valid snapshot date');
    }
  );

  it('normalizes an edited missing driver and clears the warning only after server validation', () => {
    const baseRow = {
      driver_name_original: null,
      vehicle_registration_original: 'ABC 123',
      vehicle_registration_normalized: 'ABC123',
      make_original: 'Toyota',
      model_original: 'Camry',
      weekly_rate: 250,
      snapshot_date: '2026-09-30',
      source_notes: null,
      review_acknowledged_at: null,
    };
    expect(validateFleetStagedRow(baseRow)).toMatchObject({
      validationStatus: 'needs_review',
      validationWarnings: ['Driver name is missing; admin review is required.'],
    });

    const displayedDriver = normalizeFleetDriverName('  Sam   Driver  ');
    const revalidated = validateFleetStagedRow({ ...baseRow, driver_name_original: displayedDriver });
    expect(displayedDriver).toBe('Sam Driver');
    expect(revalidated).toEqual({ validationErrors: [], validationWarnings: [], validationStatus: 'ready' });
  });

  it('keeps duplicate staged rows in review during server revalidation', () => {
    const result = validateFleetStagedRow({
      driver_name_original: 'Sam Driver',
      vehicle_registration_original: 'AB 12',
      vehicle_registration_normalized: 'AB12',
      make_original: 'Toyota',
      model_original: 'Camry',
      weekly_rate: 250,
      snapshot_date: '2026-09-30',
      source_notes: null,
      review_acknowledged_at: new Date(),
    }, true);
    expect(result.validationErrors).toContain('Duplicate registration in this import.');
    expect(result.validationStatus).toBe('needs_review');
  });

  it('does not allow acknowledgement or dry-run to bypass an unresolved duplicate', () => {
    const validation = validateFleetStagedRow({
      driver_name_original: 'Sam Driver', vehicle_registration_original: 'AB12',
      vehicle_registration_normalized: 'AB12', make_original: 'Toyota', model_original: 'Camry',
      weekly_rate: 250, snapshot_date: '2027-10-06', source_notes: null,
      review_acknowledged_at: new Date(),
    }, true, '2027-10-06');
    expect(validation.validationStatus).toBe('needs_review');
    expect(getFleetDryRunValidationConflict(validation.validationStatus)).toBe('Row still needs review.');
  });

  it.each([
    ['cancelled', 'pending'], ['applied', 'pending'], ['failed', 'pending'],
    ['needs_review', 'applied'], ['ready', 'rejected'],
  ])('rejects mutable row transition for import %s and row %s', (importStatus, rowApplyStatus) => {
    expect(() => assertMutableFleetImportRow({ importStatus, rowApplyStatus })).toThrow('cannot be changed');
  });

  it('allows a pending row in an active or partially applied import', () => {
    expect(() => assertMutableFleetImportRow({ importStatus: 'needs_review', rowApplyStatus: 'pending' })).not.toThrow();
    expect(() => assertMutableFleetImportRow({ importStatus: 'partially_applied', rowApplyStatus: 'pending' })).not.toThrow();
  });

  it('rejects mismatched rental registrations and accepts normalized matches', () => {
    expect(() => assertFleetRentalRegistrationMatch('ABC 123', 'XYZ999')).toThrow(
      'selected rental registration does not match'
    );
    expect(() => assertFleetRentalRegistrationMatch(' abc 123 ', 'ABC123')).not.toThrow();
  });

  it('builds authoritative before-and-after apply audit metadata', () => {
    expect(buildFleetApplyAuditMetadata([{
      rowId: '56c2f453-c494-4702-9e7d-f12247ec8013',
      rentalId: 42,
      registration: 'ABC123',
      existingWeeklyRate: 250,
      proposedWeeklyRate: 275,
      difference: 25,
      snapshotDate: '2026-09-30',
    }])).toEqual({
      count: 1,
      rows: [{
        fleetImportRowId: '56c2f453-c494-4702-9e7d-f12247ec8013',
        rentalId: 42,
        registration: 'ABC123',
        previousWeeklyRate: 250,
        proposedWeeklyRate: 275,
        appliedWeeklyRate: 275,
        difference: 25,
        snapshotDate: '2026-09-30',
      }],
    });
  });

  it('rejects a malformed workbook after content validation', async () => {
    await expect(parseFleetRegister({
      buffer: Buffer.from('PK\u0003\u0004not-an-office-document'),
      filename: 'fleet.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).rejects.toThrow();
  });

  it('rejects an excessive CSV row count', async () => {
    const header = 'Driver,Rego,Make,Model,Weekly Rate,Date';
    const rows = Array.from({ length: 1_001 }, (_value, index) =>
      `Driver ${index},R${index},Toyota,Camry,250,2026-09-30`
    );
    await expect(parseFleetRegister({
      buffer: Buffer.from([header, ...rows].join('\n')),
      filename: 'fleet.csv',
      mimetype: 'text/csv',
    })).rejects.toThrow('must not exceed 1000 data rows');
  });
});
