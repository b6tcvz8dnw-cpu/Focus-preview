import { inspectRecoverySnapshots } from "../data/recovery.js";

/**
 * Owns the recovery panel's DOM, raw snapshot export, and guarded restoration.
 * Data validation stays in data/recovery.js; stats mutations stay in statsStore.
 */
export function createRecoveryController({
  root,
  storage,
  statsStore,
  onMessage = () => {},
  onRestored = () => {},
  confirmAction = () => false,
  documentRef = globalThis.document,
  URLApi = globalThis.URL,
  BlobCtor = globalThis.Blob,
  schedule = globalThis.setTimeout
} = {}) {
  if (!root || !storage || !statsStore) {
    throw new TypeError("root, storage, and statsStore are required");
  }

  function render() {
    root.replaceChildren();
    const items = inspectRecoverySnapshots(storage).filter(item => item.available);
    if (!items.length) {
      const empty = documentRef.createElement("p");
      empty.className = "muted";
      empty.textContent = "復旧用データは見つかっていないよ。";
      root.appendChild(empty);
      return items;
    }

    for (const item of items) {
      const row = documentRef.createElement("div");
      row.className = "recovery-item";
      const title = documentRef.createElement("strong");
      title.textContent = item.label;
      const status = documentRef.createElement("p");
      status.className = "muted";
      status.textContent = item.status;
      const actions = documentRef.createElement("div");
      actions.className = "recovery-actions";
      const download = documentRef.createElement("button");
      download.type = "button";
      download.className = "secondary";
      download.textContent = "元データを書き出す";
      download.dataset.recoveryDownload = item.key;
      actions.appendChild(download);
      if (item.restorable) {
        const restore = documentRef.createElement("button");
        restore.type = "button";
        restore.className = "secondary";
        restore.textContent = "学習記録を復元";
        restore.dataset.recoveryRestore = item.key;
        actions.appendChild(restore);
      }
      row.append(title, status, actions);
      root.appendChild(row);
    }
    return items;
  }

  function downloadSnapshot(key) {
    const item = inspectRecoverySnapshots(storage).find(entry => entry.key === key && entry.available);
    if (!item) return false;
    let extension = "json";
    try { JSON.parse(item.rawText); } catch { extension = "txt"; }
    let url = null;
    try {
      const blob = new BlobCtor([item.rawText], {
        type: extension === "json" ? "application/json" : "text/plain"
      });
      url = URLApi.createObjectURL(blob);
      const anchor = documentRef.createElement("a");
      anchor.href = url;
      anchor.download = "focus-recovery-" + key + "." + extension;
      anchor.click();
      schedule(() => {
        try { URLApi.revokeObjectURL(url); } catch { /* best-effort URL cleanup */ }
      }, 1000);
      return true;
    } catch {
      if (url) {
        try { URLApi.revokeObjectURL(url); } catch { /* best-effort URL cleanup */ }
      }
      onMessage("復旧用データを書き出せなかったよ。端末の空き容量やブラウザの設定を確認してね。");
      return false;
    }
  }

  function restoreSnapshot(key) {
    const item = inspectRecoverySnapshots(storage).find(entry =>
      entry.key === key && entry.available && entry.restorable
    );
    if (!item) {
      onMessage("このデータは自動復元できないため、元データを書き出して保管してね。");
      return false;
    }
    if (!confirmAction("このバックアップの学習記録と目標で、現在の記録を置き換える？\n復元直前のデータも端末内に保護するよ。")) {
      return false;
    }

    const currentRaw = storage.getText("focus-stats", null);
    if (currentRaw !== null && !storage.setText("focus-pre-recovery-raw-stats", currentRaw)) {
      onMessage("復元直前のデータを保護できなかったため、復元を中止したよ。");
      return false;
    }

    const result = statsStore.replaceStats(item.stats);
    if (!result.ok) {
      onMessage("復元データの保存に失敗したよ。復元直前のデータは保護してあるので、空き容量などを確認してね。");
      return false;
    }
    onRestored();
    render();
    onMessage("学習記録を復元したよ。復元直前のデータも端末内に保護してあるよ。");
    return true;
  }

  function handleClick(event) {
    const download = event.target.closest("[data-recovery-download]");
    if (download) {
      downloadSnapshot(download.dataset.recoveryDownload);
      return;
    }
    const restore = event.target.closest("[data-recovery-restore]");
    if (restore) restoreSnapshot(restore.dataset.recoveryRestore);
  }

  root.addEventListener("click", handleClick);
  return { render, downloadSnapshot, restoreSnapshot, destroy() {
    root.removeEventListener("click", handleClick);
  }};
}
