// Date-boundary helpers for dashboard metrics (BR-18).
// All boundaries are computed in Asia/Bangkok (UTC+7, no DST), not server/UTC.

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

// Lower bound for the "last 7 days" window: start-of-day in Bangkok of
// (todayBangkok − 6 days), expressed as a UTC instant. Inclusive of that day
// boundary, so the window spans 7 calendar days (today + the previous six).
// Example: a Ticket resolved at Bangkok-midnight exactly is inside the window.
export function bangkokRecentCutoff(now: Date = new Date()): Date {
  // Shift the instant forward by the offset so its UTC fields read as the
  // Bangkok wall-clock date, then rebuild midnight and shift back.
  const bkk = new Date(now.getTime() + BKK_OFFSET_MS);
  const y = bkk.getUTCFullYear();
  const m = bkk.getUTCMonth();
  const d = bkk.getUTCDate();
  return new Date(Date.UTC(y, m, d - 6, 0, 0, 0, 0) - BKK_OFFSET_MS);
}
