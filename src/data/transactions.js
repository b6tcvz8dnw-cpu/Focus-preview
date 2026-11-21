/**
 * Replace the current stats only after a recoverable pre-change snapshot exists.
 * localStorage.setItem is atomic per key: if the stats write fails, the previous
 * stats remain intact and the backup is kept for manual recovery.
 */
export function writeStatsWithBackup(store, {
  backupKey = "focus-preimport-backup",
  statsKey = "focus-stats",
  backupPayload,
  statsPayload
}) {
  if (!store.setJSON(backupKey, backupPayload)) {
    return { ok: false, stage: "backup" };
  }
  if (!store.setJSON(statsKey, statsPayload)) {
    return { ok: false, stage: "stats" };
  }
  return { ok: true, stage: "complete" };
}
