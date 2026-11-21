import { dateKey } from "../core/date-time.js";

/**
 * Rebuild aggregate totals from legacy totals plus detailed session records.
 * Returns new values and never mutates the supplied records or history.
 */
export function calculateStats({
  legacyCompleted = 0,
  legacyMinutes = 0,
  legacyHistory = {},
  records = []
} = {}) {
  const input = Array.isArray(records) ? records : [];
  const seen = new Set();
  const sessions = input.filter((record) => {
    if (!record || typeof record !== "object") return false;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const safeLegacyHistory = legacyHistory && typeof legacyHistory === "object" && !Array.isArray(legacyHistory)
    ? legacyHistory
    : {};

  const legacySessionCount = Number(legacyCompleted);
  const legacyMinuteCount = Number(legacyMinutes);
  const completed = (Number.isFinite(legacySessionCount) ? Math.max(0, legacySessionCount) : 0) + sessions.length;
  const minutes = (Number.isFinite(legacyMinuteCount) ? Math.max(0, legacyMinuteCount) : 0)
    + sessions.reduce((total, record) => {
      const value = Number(record.minutes);
      return total + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);

  const history = { ...safeLegacyHistory };
  for (const record of sessions) {
    const key = record?.date || dateKey(new Date(Number(record?.timestamp)));
    if (!key || key === "Invalid Date") continue;
    const previousValue = Number(history[key]);
    const recordMinutes = Number(record.minutes);
    const previous = Number.isFinite(previousValue) && previousValue > 0 ? previousValue : 0;
    history[key] = previous + (Number.isFinite(recordMinutes) && recordMinutes > 0 ? recordMinutes : 0);
  }

  return { completed, minutes, history };
}
