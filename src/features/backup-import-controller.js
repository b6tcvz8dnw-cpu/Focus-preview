// Coordinates validated backup import and protects the complete pre-import state.
export function createBackupImportController({
  input,
  storage,
  statsStore,
  validate,
  buildCurrentBackup,
  confirmAction = () => false,
  captureSettings = () => ({}),
  applySettings = () => true,
  rollbackSettings = () => true,
  onSuccess = () => {},
  onMessage = () => {},
  onRefresh = () => {}
} = {}) {
  if (!input || !storage || !statsStore || typeof validate !== "function" || typeof buildCurrentBackup !== "function") {
    throw new TypeError("input, storage, statsStore, validate, and buildCurrentBackup are required");
  }

  function rollbackSafely(snapshot) {
    try { return rollbackSettings(snapshot) !== false; }
    catch { return false; }
  }

  async function importText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      onMessage("ファイルを読み込めなかったよ。JSONの形式を確認してね。");
      return { ok: false, stage: "parse" };
    }

    const checked = validate(parsed);
    if (!checked.valid) {
      onMessage(checked.reason);
      return { ok: false, stage: "validation" };
    }
    if (!confirmAction("現在の学習記録をバックアップの内容で置き換える？\n読み込み前の状態も端末内に退避するよ。")) {
      return { ok: false, stage: "cancelled" };
    }

    let currentSnapshot, settingsSnapshot;
    try {
      currentSnapshot = buildCurrentBackup();
      settingsSnapshot = captureSettings();
    } catch {
      onMessage("読み込み前の状態を確認できなかったため、読み込みを中止したよ。");
      return { ok: false, stage: "snapshot" };
    }
    if (!storage.setJSON("focus-preimport-backup", currentSnapshot)) {
      onMessage("端末内バックアップを作成できなかったため、読み込みを中止したよ。");
      return { ok: false, stage: "backup" };
    }

    const next = checked.data;
    let settingsApplied = false;
    try {
      const applied = applySettings(next);
      if (applied === false) {
        const rolledBack = rollbackSafely(settingsSnapshot);
        onMessage(rolledBack ? "設定の保存に失敗したため、読み込みを中止したよ。読み込み前のデータは退避してあるよ。" : "設定の保存に失敗し、元の設定も完全には戻せなかったよ。再読み込みして状態を確認してね。退避データは残してあるよ。");
        return { ok: false, stage: rolledBack ? "settings" : "rollback" };
      }
      settingsApplied = true;
    } catch {
      const rolledBack = rollbackSafely(settingsSnapshot);
      onMessage(rolledBack ? "設定の反映に失敗したため、読み込みを中止したよ。読み込み前のデータは退避してあるよ。" : "設定の反映に失敗し、元の設定も完全には戻せなかったよ。再読み込みして状態を確認してね。退避データは残してあるよ。");
      return { ok: false, stage: rolledBack ? "settings" : "rollback" };
    }

    const transaction = statsStore.replaceStats(next.stats);
    if (!transaction.ok) {
      const rolledBack = settingsApplied ? rollbackSafely(settingsSnapshot) : true;
      onMessage(rolledBack ? "学習記録の保存に失敗したよ。読み込み前のデータは保護してあるので、再読み込みして状態を確認してね。" : "学習記録の保存と設定の復元に失敗したよ。再読み込みして状態を確認してね。退避データは残してあるよ。");
      return { ok: false, stage: rolledBack ? "stats" : "rollback", transaction };
    }

    onRefresh();
    onSuccess();
    onMessage("バックアップを読み込んだよ。読み込み前のデータは端末内に退避してあるよ。ページを再読み込みすると設定も反映されるよ。");
    return { ok: true, stage: "complete" };
  }

  async function handleChange(event) {
    const file = event?.target?.files?.[0];
    if (!file) return { ok: false, stage: "empty" };
    try {
      return await importText(await file.text());
    } catch {
      onMessage("ファイルを読み込めなかったよ。JSONの形式を確認してね。");
      return { ok: false, stage: "read" };
    } finally {
      if (event?.target) event.target.value = "";
    }
  }

  input.addEventListener("change", handleChange);
  return {
    importText,
    handleChange,
    destroy() { input.removeEventListener("change", handleChange); }
  };
}
