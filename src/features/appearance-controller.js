const THEMES = {
  green: { bg: "#101915", panel: "#19251f", deep: "#111b16", line: "#304138", text: "#edf4ef", muted: "#9eafa4", accent: "#8ec5a3", accent2: "#294b38", tab: "rgba(16,25,21,.96)" },
  blue: { bg: "#101923", panel: "#192838", deep: "#111d29", line: "#30475a", text: "#edf4fb", muted: "#9eafc1", accent: "#8ab9e8", accent2: "#244765", tab: "rgba(16,25,35,.96)" },
  purple: { bg: "#191522", panel: "#251e32", deep: "#1b1726", line: "#443653", text: "#f2edf9", muted: "#b2a5c3", accent: "#b8a0e8", accent2: "#443663", tab: "rgba(25,21,34,.96)" },
  amber: { bg: "#1b1710", panel: "#2a2318", deep: "#201a11", line: "#51432c", text: "#f8f0e2", muted: "#bcae94", accent: "#e7b96f", accent2: "#574323", tab: "rgba(27,23,16,.96)" },
  rose: { bg: "#1b1317", panel: "#2a1d23", deep: "#21171c", line: "#50333d", text: "#f8edf0", muted: "#bea5ad", accent: "#e6a0ad", accent2: "#59323d", tab: "rgba(27,19,23,.96)" }
};
const MARKS = { dot: "●", star: "✦", leaf: "❧" };
const HOME_ICONS = { planet: "./icons/icon-planet.png", hourglass: "./icons/icon-hourglass.png", window: "./icons/icon-window.png", comet: "./icons/icon-comet.png" };

export function createAppearanceController({ root, storage, onMessage = () => {} }) {
  if (!root || !storage) throw new TypeError("root and storage are required");
  let theme = "green";
  let mark = "dot";
  let homeIcon = "planet";
  const listeners = [];

  function renderTheme(name) {
    const palette = THEMES[name];
    const variables = {
      bg: palette.bg, panel: palette.panel, "surface-deep": palette.deep,
      line: palette.line, text: palette.text, muted: palette.muted,
      accent: palette.accent, accent2: palette.accent2, "tab-bg": palette.tab
    };
    for (const [key, value] of Object.entries(variables)) root.documentElement.style.setProperty("--" + key, value);
    for (const button of root.querySelectorAll("[data-theme]")) {
      const active = button.dataset.theme === name;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }
    root.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
  }

  function renderMark(name) {
    const brand = root.getElementById("brandMark");
    if (brand) brand.textContent = MARKS[name];
    for (const button of root.querySelectorAll("[data-mark]")) {
      const active = button.dataset.mark === name;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function renderHomeIcon(name) {
    const href = HOME_ICONS[name];
    for (const selector of ['#appleTouchIcon', '#appFavicon']) {
      const link = root.querySelector(selector);
      if (link) link.setAttribute("href", href);
    }
    for (const button of root.querySelectorAll("[data-home-icon]")) {
      const active = button.dataset.homeIcon === name;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function setHomeIcon(name, { persist = true } = {}) {
    const nextIcon = Object.hasOwn(HOME_ICONS, name) ? name : "planet";
    if (persist && !storage.setText("focus-home-icon", nextIcon)) {
      onMessage("ホーム画面アイコンの設定を保存できなかったよ。端末の空き容量やブラウザの状態を確認してね。");
      return false;
    }
    homeIcon = nextIcon;
    renderHomeIcon(homeIcon);
    return getState();
  }

  function setTheme(name, { persist = true } = {}) {
    const nextTheme = Object.hasOwn(THEMES, name) ? name : "green";
    if (persist && !storage.setJSON("focus-appearance", { theme: nextTheme, mark })) {
      onMessage("テーマを保存できなかったよ。端末の空き容量やブラウザの状態を確認してね。");
      return false;
    }
    theme = nextTheme;
    renderTheme(theme);
    return getState();
  }

  function setMark(name, { persist = true } = {}) {
    const nextMark = Object.hasOwn(MARKS, name) ? name : "dot";
    if (persist && !storage.setText("focus-mark", nextMark)) {
      onMessage("マークを保存できなかったよ。端末の空き容量やブラウザの状態を確認してね。");
      return false;
    }
    mark = nextMark;
    renderMark(mark);
    return getState();
  }

  function initialize() {
    const savedAppearance = storage.getJSON("focus-appearance", null);
    theme = Object.hasOwn(THEMES, savedAppearance?.theme) ? savedAppearance.theme : "green";
    const savedMark = storage.getText("focus-mark", "dot");
    mark = Object.hasOwn(MARKS, savedMark) ? savedMark : "dot";
    const savedHomeIcon = storage.getText("focus-home-icon", "planet");
    homeIcon = Object.hasOwn(HOME_ICONS, savedHomeIcon) ? savedHomeIcon : "planet";
    renderTheme(theme);
    renderMark(mark);
    renderHomeIcon(homeIcon);
    for (const button of root.querySelectorAll("[data-theme]")) {
      const handler = () => setTheme(button.dataset.theme);
      button.addEventListener("click", handler);
      listeners.push([button, handler]);
    }
    for (const button of root.querySelectorAll("[data-mark]")) {
      const handler = () => setMark(button.dataset.mark);
      button.addEventListener("click", handler);
      listeners.push([button, handler]);
    }
    for (const button of root.querySelectorAll("[data-home-icon]")) {
      const handler = () => setHomeIcon(button.dataset.homeIcon);
      button.addEventListener("click", handler);
      listeners.push([button, handler]);
    }
    return getState();
  }

  function getState() { return { theme, mark, homeIcon }; }

  function destroy() {
    for (const [button, handler] of listeners) button.removeEventListener("click", handler);
    listeners.length = 0;
  }

  return { initialize, setTheme, setMark, setHomeIcon, getState, destroy };
}
