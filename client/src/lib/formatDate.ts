// Locale-stable date/time formatting.
// Always renders a Gregorian date in "31 Oct 2026, 11:30" form regardless of the
// browser's locale (we pin en-GB, which uses day → short-month → year → 24h time).
// `timeZone` is optional; when omitted the viewer's local zone is used (correct for
// display), and tests pass an explicit zone for a deterministic assertion.
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

export function formatDateTime(value: string | Date, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    ...DATE_TIME_OPTIONS,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
