const CSV_FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

export const encodeCsvCell = (value: unknown) => {
  const rawValue = String(value ?? '');
  const formulaSafeValue = CSV_FORMULA_PREFIX.test(rawValue) ? `'${rawValue}` : rawValue;

  return `"${formulaSafeValue.replace(/"/g, '""')}"`;
};

export const encodeCsvRows = (rows: ReadonlyArray<ReadonlyArray<unknown>>) =>
  rows.map((row) => row.map(encodeCsvCell).join(',')).join('\n');
