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

    const currentSnapshot = buildCurrentBackup();
    const settingsSnapshot = captureSettings();
    if (!storage.setJSON("focus-preimport-backup", currentSnapshot)) {
      onMessage("端末内バックアップを作成できなかったため、読み込みを中止したよ。");
      return { ok: false, stage: "backup" };
    }

    const next = checked.data;
    let settingsApplied = false;
    try {
      const applied = applySettings(next);
      if (applied === false) {
        rollbackSettings(settingsSnapshot);
        onMessage("設定の保存に失敗したため、読み込みを中止したよ。読み込み前のデータは退避してあるよ。");
        return { ok: false, stage: "settings" };
      }
      settingsApplied = true;
    } catch {
      rollbackSettings(settingsSnapshot);
      onMessage("設定の反映に失敗したため、読み込みを中止したよ。読み込み前のデータは退避してあるよ。");
      return { ok: false, stage: "settings" };
    }

    const transaction = statsStore.replaceStats(next.stats);
    if (!transaction.ok) {
      if (settingsApplied) rollbackSettings(settingsSnapshot);
      onMessage("学習記録の保存に失敗したよ。読み込み前のデータは保護してあるので、再読み込みして状態を確認してね。");
      return { ok: false, stage: "stats", transaction };
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
