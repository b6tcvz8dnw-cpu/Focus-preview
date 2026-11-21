/**
 * Pure date and time helpers shared by FOCUS features.
 * These functions deliberately avoid DOM, storage, and browser globals.
 */

/** Format a whole number of seconds as MM:SS. */
export function formatClock(seconds) {
  return String(Math.floor(seconds / 60)).padStart(2, "0")
    + ":"
    + String(seconds % 60).padStart(2, "0");
}

/** Return a local-calendar date key in YYYY-MM-DD form. */
export function dateKey(date) {
  return date.getFullYear()
    + "-"
    + String(date.getMonth() + 1).padStart(2, "0")
    + "-"
    + String(date.getDate()).padStart(2, "0");
}

/** Build the rolling seven-day summary used by the overview chart. */
export function buildWeekData(history, now = new Date()) {
  const data = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - offset
    );
    const key = dateKey(date);
    data.push({
      key,
      label: ["日", "月", "火", "水", "木", "金", "土"][date.getDay()],
      minutes: Number.isFinite(Number(history?.[key])) ? Math.max(0, Number(history[key])) : 0
    });
  }
  return data;
}

/** Map today's accumulated focus minutes to the Study Room sky stage. */
export function getStudySkyLevel(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  if (value >= 180) return 4;
  if (value >= 120) return 3;
  if (value >= 60) return 2;
  if (value >= 30) return 1;
  return 0;
}
