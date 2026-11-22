import { calculateStats } from "./records.js";
import { normalizeStatsData, CURRENT_DATA_SCHEMA_VERSION } from "./schema.js";
import { writeStatsWithBackup } from "./transactions.js";

const DEFAULT_STATS = Object.freeze({
  completed: 0, minutes: 0, history: {}, records: [],
  legacyCompleted: 0, legacyMinutes: 0, legacyHistory: {},
  dailyGoal: 60, weeklyGoal: 300
});

function buildState(raw) {
  const normalized = normalizeStatsData(raw);
  const totals = calculateStats(normalized);
  return {
    ...normalized,
    completed: totals.completed,
    minutes: totals.minutes,
    history: totals.history
  };
}

function protectRawSnapshot(key, rawText) {
  const existing = storage.getText(key, null);
  if (existing !== null) return existing === rawText;
  return storage.setText(key, rawText);
}

function cloneState(state) {
  return {
    ...state,
    history: { ...state.history },
    legacyHistory: { ...state.legacyHistory },
    records: state.records.map((record) => ({ ...record }))
  };
}

/**
 * Owns learning records, aggregate statistics, goals, persistence, and safe
 * replacement. It has no DOM dependency; callers render from getState().
 */
export function createStudyStatsStore({ storage, onChange = () => {} } = {}) {
  if (!storage) throw new TypeError("A storage adapter is required");

  let state = buildState(DEFAULT_STATS);
  let writeBlocked = false;

  function snapshot() {
    return cloneState(state);
  }

  function serialize(next = state) {
    return {
      schemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      completed: next.completed,
      minutes: next.minutes,
      history: next.history,
      records: next.records,
      legacyCompleted: next.legacyCompleted,
      legacyMinutes: next.legacyMinutes,
      legacyHistory: next.legacyHistory,
      dailyGoal: next.dailyGoal,
      weeklyGoal: next.weeklyGoal
    };
  }

  function emit() {
    onChange(snapshot(), { writeBlocked });
  }

  function persist(next = state) {
    if (writeBlocked) return false;
    return storage.setJSON("focus-stats", serialize(next));
  }

  function commit(next, { save = true } = {}) {
    const candidate = buildState(next);
    // Persist the candidate before publishing it. A failed write must not
    // leave the in-memory view ahead of the durable local record.
    if (save && !persist(candidate)) return false;
    state = candidate;
    emit();
    return true;
  }

  function load() {
    let rawText = null;
    let raw = {};
    let persistNormalized = true;
    let message = "";

    try {
      rawText = storage.getText("focus-stats", null);
      if (rawText !== null) {
        try {
          raw = JSON.parse(rawText);
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error("Invalid stats payload");
          }
        } catch {
          persistNormalized = protectRawSnapshot("focus-corrupt-stats-backup", rawText);
          raw = {};
          message = persistNormalized
            ? "保存データの形式が壊れていたため、元データを端末内に退避して初期化したよ。"
            : "保存データが壊れていたよ。元データを保護できなかったため、上書き保存を停止しているよ。";
        }

        if (Number(raw.schemaVersion) > CURRENT_DATA_SCHEMA_VERSION) {
          persistNormalized = false;
          message = "この保存データは新しいFOCUSで作られているため、上書きせずに保護しているよ。";
        } else if (rawText !== null && raw.schemaVersion !== CURRENT_DATA_SCHEMA_VERSION && persistNormalized) {
          persistNormalized = protectRawSnapshot("focus-pre-migration-backup", rawText);
          if (!persistNormalized) {
            message = "旧データの退避に失敗したため、上書き保存を停止しているよ。";
          }
        }
      }

      writeBlocked = !persistNormalized;
      state = buildState(raw);
      if (persistNormalized) persist();
      emit();
      return { state: snapshot(), writeBlocked, message };
    } catch (error) {
      writeBlocked = true;
      state = buildState(DEFAULT_STATS);
      emit();
      return {
        state: snapshot(), writeBlocked,
        message: "学習データを読み込めなかったため、上書き保存を停止しているよ。"
      };
    }
  }

  function addSession(record) {
    return commit({ ...state, records: [...state.records, { ...record }] });
  }

  function updateRecord(id, patch) {
    const index = state.records.findIndex((record) => record.id === id);
    if (index < 0) return false;
    const records = state.records.map((record, i) =>
      i === index ? { ...record, ...patch } : record
    );
    return commit({ ...state, records });
  }

  function deleteRecord(id) {
    const records = state.records.filter((record) => record.id !== id);
    if (records.length === state.records.length) return false;
    return commit({ ...state, records });
  }

  function clearDayRecords(date) {
    const removed = state.records.filter((record) => (record.date || "") === date);
    const records = state.records.filter((record) => (record.date || "") !== date);
    const legacyHistory = { ...state.legacyHistory, [date]: 0 };
    const legacyCompleted = state.legacyCompleted + removed.length;
    const legacyMinutes = state.legacyMinutes
      + removed.reduce((sum, record) => sum + (Number(record.minutes) || 0), 0);
    return commit({ ...state, records, legacyHistory, legacyCompleted, legacyMinutes });
  }

  function setGoals(dailyGoal, weeklyGoal) {
    return commit({ ...state, dailyGoal, weeklyGoal });
  }

  function replaceStats(rawStats, { backupKey, backupPayload } = {}) {
    const next = buildState(rawStats);
    const payload = serialize(next);
    if (backupKey) {
      const result = writeStatsWithBackup(storage, {
        backupKey, backupPayload, statsPayload: payload
      });
      if (!result.ok) return result;
    } else if (!storage.setJSON("focus-stats", payload)) {
      return { ok: false, stage: "stats" };
    }
    writeBlocked = false;
    state = next;
    emit();
    return { ok: true, stage: "complete" };
  }

  return {
    getState: snapshot,
    isWriteBlocked: () => writeBlocked,
    load,
    save: persist,
    addSession,
    updateRecord,
    deleteRecord,
    clearDayRecords,
    setGoals,
    replaceStats,
    exportStats: () => serialize()
  };
}
