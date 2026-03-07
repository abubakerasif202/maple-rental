export const OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE =
  'Operational customer and invoice history is not installed in this environment yet. Run the operational history migration before importing workbook history.';

export const isMissingOperationalHistoryTableError = (error: unknown) => {
  const candidate = error as { code?: string; message?: string } | null;
  const message = candidate?.message || '';

  return (
    candidate?.code === 'PGRST205' ||
    /could not find the table/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
};

