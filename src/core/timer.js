/**
 * Pure timer calculations shared by the focus timer and the break hourglass.
 */

/** Calculate remaining whole seconds from an absolute deadline. */
export function getRemainingSeconds(deadline, now = Date.now()) {
  const end = Number(deadline);
  const current = Number(now);
  if (!Number.isFinite(end) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.ceil((end - current) / 1000));
}

/** Choose the break that follows a completed focus session. */
export function getNextBreakMode(completedSessions, sessionsPerLongBreak) {
  const completedValue = Number(completedSessions);
  const intervalValue = Number(sessionsPerLongBreak);
  const completed = Number.isFinite(completedValue) ? Math.max(0, Math.floor(completedValue)) : 0;
  const interval = Number.isFinite(intervalValue) ? Math.max(2, Math.floor(intervalValue)) : 4;
  return completed > 0 && completed % interval === 0 ? "long" : "short";
}
