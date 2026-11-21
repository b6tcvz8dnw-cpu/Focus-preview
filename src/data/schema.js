import { dateKey } from "../core/date-time.js";

export const CURRENT_DATA_SCHEMA_VERSION = 1;
export const CURRENT_BACKUP_VERSION = 3;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finiteNonNegative = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};
const integerInRange = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

function validDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00");
  return Number.isFinite(date.getTime()) && dateKey(date) === value;
}

function normalizeHistory(value) {
  if (!isObject(value)) return {};
  const result = {};
  for (const [key, rawMinutes] of Object.entries(value)) {
    if (!validDateKey(key)) continue;
    const minutes = finiteNonNegative(rawMinutes, 0);
    result[key] = Math.floor(minutes);
  }
  return result;
}

function normalizeRecords(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  value.forEach((raw, index) => {
    if (!isObject(raw)) return;
    const timestamp = Number(raw.timestamp);
    const minutes = Number(raw.minutes);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime()) || !Number.isInteger(minutes) || minutes < 1 || minutes > 120) return;
    const date = validDateKey(raw.date) ? raw.date : dateKey(new Date(timestamp));
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 100) : `legacy-${timestamp}-${index}`;
    if (seen.has(id)) return;
    seen.add(id);
    result.push({
      id,
      timestamp,
      date,
      minutes,
      note: typeof raw.note === "string" ? raw.note.slice(0, 2000) : ""
    });
  });
  return result;
}

/**
 * Migrate pre-versioned stats (the format used by existing FOCUS installs)
 * and normalize values before they enter application state.
 */
export function normalizeStatsData(raw) {
  const source = isObject(raw) ? raw : {};
  const records = normalizeRecords(source.records);
  const history = normalizeHistory(source.history);
  const recordMinutes = records.reduce((sum, record) => sum + record.minutes, 0);
  const recordDates = {};
  for (const record of records) recordDates[record.date] = (recordDates[record.date] || 0) + record.minutes;

  const completedTotal = finiteNonNegative(source.completed, records.length);
  const minutesTotal = finiteNonNegative(source.minutes, recordMinutes);
  const legacyCompleted = Number.isFinite(Number(source.legacyCompleted))
    ? finiteNonNegative(source.legacyCompleted)
    : Math.max(0, completedTotal - records.length);
  const legacyMinutes = Number.isFinite(Number(source.legacyMinutes))
    ? finiteNonNegative(source.legacyMinutes)
    : Math.max(0, minutesTotal - recordMinutes);

  let legacyHistory;
  if (isObject(source.legacyHistory)) {
    legacyHistory = normalizeHistory(source.legacyHistory);
  } else {
    legacyHistory = {};
    for (const [key, value] of Object.entries(history)) {
      legacyHistory[key] = Math.max(0, value - (recordDates[key] || 0));
    }
  }

  return {
    schemaVersion: CURRENT_DATA_SCHEMA_VERSION,
    legacyCompleted: Math.floor(legacyCompleted),
    legacyMinutes: Math.floor(legacyMinutes),
    legacyHistory,
    records,
    dailyGoal: integerInRange(source.dailyGoal, 0, 1440, 60),
    weeklyGoal: integerInRange(source.weeklyGoal, 0, 10080, 300)
  };
}

export function normalizeTimerSettings(raw) {
  if (!isObject(raw)) return null;
  const focus = integerInRange(raw.focus, 1, 120, null);
  const short = integerInRange(raw.short, 1, 60, null);
  const long = integerInRange(raw.long, 1, 90, null);
  const cycle = integerInRange(raw.cycle, 2, 8, null);
  return focus === null || short === null || long === null || cycle === null
    ? null
    : { focus, short, long, cycle };
}

const allowedThemes = new Set(["green", "blue", "purple", "amber", "rose"]);
const allowedMarks = new Set(["dot", "star", "leaf"]);

/** Validate supported backup generations and return a safe, normalized payload. */
export function validateBackupPayload(raw) {
  if (!isObject(raw)) return { valid: false, reason: "バックアップの形式が正しくありません。" };
  if (raw.app !== "FOCUS") return { valid: false, reason: "FOCUSのバックアップではありません。" };
  const version = raw.version === undefined ? 1 : Number(raw.version);
  if (!Number.isInteger(version) || version < 1 || version > CURRENT_BACKUP_VERSION) {
    return { valid: false, reason: "このバックアップ形式には対応していません。" };
  }
  if (!isObject(raw.stats) || !Array.isArray(raw.stats.records)) {
    return { valid: false, reason: "学習記録のデータが見つからないか、形式が正しくありません。" };
  }

  const stats = normalizeStatsData(raw.stats);
  const timerSettings = raw.timerSettings == null ? null : normalizeTimerSettings(raw.timerSettings);
  if (raw.timerSettings != null && !timerSettings) {
    return { valid: false, reason: "タイマー設定に不正な値があります。" };
  }
  const appearance = raw.appearance == null ? null : raw.appearance;
  if (appearance !== null && (!isObject(appearance) || (appearance.theme != null && !allowedThemes.has(appearance.theme)))) {
    return { valid: false, reason: "外観設定に不正な値があります。" };
  }
  const mark = raw.mark == null ? "dot" : raw.mark;
  if (!allowedMarks.has(mark)) return { valid: false, reason: "アプリアイコン設定に不正な値があります。" };

  return {
    valid: true,
    data: {
      app: "FOCUS",
      version: CURRENT_BACKUP_VERSION,
      stats,
      timerSettings,
      appearance: appearance ? { theme: appearance.theme } : null,
      mark,
      notificationsEnabled: typeof raw.notificationsEnabled === "boolean" ? raw.notificationsEnabled : null,
      quietText: typeof raw.quietText === "boolean" ? raw.quietText : null
    }
  };
}
