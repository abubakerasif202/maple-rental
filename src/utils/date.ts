/**
 * Calculates the difference in days between two dates.
 *
 * @param startDateInput - The start date string.
 * @param endDateInput - The end date string.
 * @returns The difference in days, or null if inputs are invalid or difference is <= 0.
 */
export const getDateDiffInDays = (startDateInput: string, endDateInput: string): number | null => {
  const startDate = new Date(startDateInput);
  const endDate = new Date(endDateInput);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) return null;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};
