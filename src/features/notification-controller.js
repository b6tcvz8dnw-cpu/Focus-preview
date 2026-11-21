// Notification permission, preference persistence, and delivery lifecycle.
export function createNotificationController({
  root = document,
  storage,
  getNotificationApi = () => globalThis.Notification,
  onMessage = () => {},
  onStateChange = () => {}
} = {}) {
  if (!storage) throw new TypeError("storage is required");
  let enabled = storage.getText("focus-notifications") === "true";

  function render() {
    const button = root.getElementById?.("notificationToggle");
    if (button) {
      button.textContent = "完了通知：" + (enabled ? "オン" : "オフ");
      button.setAttribute("aria-pressed", String(enabled));
    }
    onStateChange(enabled);
  }

  function persist(next) {
    enabled = Boolean(next);
    storage.setText("focus-notifications", String(enabled));
    render();
  }

  async function toggle() {
    if (enabled) {
      persist(false);
      onMessage("通知設定を保存したよ。");
      return true;
    }

    const NotificationApi = getNotificationApi();
    if (!NotificationApi) {
      onMessage("このブラウザは通知に対応していないようだよ。");
      return false;
    }

    let permission = NotificationApi.permission;
    if (permission === "default" && typeof NotificationApi.requestPermission === "function") {
      try {
        permission = await NotificationApi.requestPermission();
      } catch {
        permission = "denied";
      }
    }
    if (permission !== "granted") {
      onMessage("通知は許可されなかったため、オフのままだよ。");
      return false;
    }

    persist(true);
    onMessage("通知設定を保存したよ。");
    return true;
  }

  function notify(title) {
    if (enabled) {
      const NotificationApi = getNotificationApi();
      if (NotificationApi && NotificationApi.permission === "granted") {
        try {
          new NotificationApi(title, { body: "FOCUS — 学習タイマー" });
        } catch {}
      }
    }
    onMessage(title);
  }

  function setEnabled(next) {
    persist(next);
  }

  render();
  const button = root.getElementById?.("notificationToggle");
  if (button) button.onclick = toggle;

  return {
    toggle,
    notify,
    setEnabled,
    isEnabled: () => enabled,
    destroy() {
      if (button && button.onclick === toggle) button.onclick = null;
    }
  };
}
