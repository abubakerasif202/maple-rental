const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SYDNEY_TIME_ZONE = 'Australia/Sydney';

const parseDateOnlyAsUtc = (value: string) => {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) return null;

  return parsed;
};

export const getAustraliaDateSortValue = (value?: string | null) => {
  if (!value) return Number.NaN;
  return (parseDateOnlyAsUtc(value) || new Date(value)).getTime();
};

export const formatAustraliaDate = (value?: string | null, fallback = 'N/A') => {
  if (!value) return fallback;

  const dateOnly = parseDateOnlyAsUtc(value);
  const parsed = dateOnly || new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-AU', {
    timeZone: dateOnly ? 'UTC' : SYDNEY_TIME_ZONE,
  }).format(parsed);
};
