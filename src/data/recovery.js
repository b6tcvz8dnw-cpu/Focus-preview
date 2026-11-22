import { normalizeStatsData, validateBackupPayload, CURRENT_DATA_SCHEMA_VERSION } from "./schema.js";

const SOURCES = [
  { key: "focus-preimport-backup", label: "インポート直前のバックアップ", kind: "backup" },
  { key: "focus-pre-migration-backup", label: "データ形式の移行前バックアップ", kind: "stats" },
  { key: "focus-corrupt-stats-backup", label: "読み込みに失敗した元データ", kind: "raw" },
  { key: "focus-pre-recovery-raw-stats", label: "復元操作の直前に保護したデータ", kind: "stats" },
  { key: "focus-pre-auto-restore", label: "自動バックアップ復元前のデータ", kind: "stats" }
];

/**
 * Inspect local recovery snapshots without changing or deleting any stored data.
 * Raw corrupt content remains downloadable even when it cannot be restored.
 */
export function inspectRecoverySnapshots(store) {
  const items = SOURCES.map((source) => {
    const rawText = store.getText(source.key, null);
    if (rawText === null) return { ...source, available: false, restorable: false };

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        ...source, available: true, restorable: false, rawText,
        status: "JSONとして読み込めないため、元データの書き出しのみ可能です。"
      };
    }

    if (source.kind === "backup") {
      const checked = validateBackupPayload(parsed);
      return {
        ...source, available: true, restorable: checked.valid,
        stats: checked.valid ? checked.data.stats : null,
        rawText,
        status: checked.valid ? "復元できます（学習記録・目標）" : checked.reason
      };
    }

    if (source.kind === "stats") {
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ...source, available: true, restorable: false, rawText, status: "データ形式を確認できません。" };
      }
      if (Number(parsed.schemaVersion) > CURRENT_DATA_SCHEMA_VERSION) {
        return { ...source, available: true, restorable: false, rawText, status: "新しい形式のデータのため、この版では復元できません。元データを書き出せます。" };
      }
      return {
        ...source, available: true, restorable: true,
        stats: normalizeStatsData(parsed), rawText,
        status: "復元できます（学習記録・目標）"
      };
    }

    return {
      ...source, available: true, restorable: false, rawText,
      status: "破損時の原文です。内容を確認できるよう書き出せますが、自動復元はできません。"
    };
  });

  // A future-version live payload is deliberately not restorable here, but it
  // must remain exportable so the user can preserve it before updating FOCUS.
  const currentRaw = store.getText("focus-stats", null);
  if (currentRaw !== null) {
    let current;
    try {
      current = JSON.parse(currentRaw);
    } catch {
      current = null;
    }
    if (!current || typeof current !== "object" || Array.isArray(current)
      || Number(current.schemaVersion) > CURRENT_DATA_SCHEMA_VERSION) {
      items.push({
        key: "focus-current-protected-stats",
        label: "現在の保存データ（保護中）",
        kind: "raw",
        available: true,
        restorable: false,
        rawText: currentRaw,
        status: current && Number(current.schemaVersion) > CURRENT_DATA_SCHEMA_VERSION
          ? "新しい形式のデータです。この版では変更・復元せず、元データの書き出しだけ行えます。"
          : "現在の保存データを正常に解析できません。元データの書き出しだけ行えます。"
      });
    }
  }

  return items;
}
