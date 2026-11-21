/**
 * Small defensive adapter around browser storage.
 * A provider is injected so the behavior can be tested without a browser.
 */
export function createStorage(resolveStorage = () => globalThis.localStorage, { prefix = "" } = {}) {
  const storageKey = (key) => `${prefix}${key}`;

  const getStorage = () => {
    try {
      return resolveStorage() || null;
    } catch {
      return null;
    }
  };

  return {
    getText(key, fallback = null) {
      try {
        const value = getStorage()?.getItem(storageKey(key));
        return value === null || value === undefined ? fallback : value;
      } catch {
        return fallback;
      }
    },

    setText(key, value) {
      try {
        const target = getStorage();
        if (!target) return false;
        target.setItem(storageKey(key), String(value));
        return true;
      } catch {
        return false;
      }
    },

    getJSON(key, fallback = null) {
      const raw = this.getText(key, null);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    setJSON(key, value) {
      try {
        return this.setText(key, JSON.stringify(value));
      } catch {
        return false;
      }
    }
  };
}

// GitHub Pages project sites share one origin; keep preview data separate from production.
export const storage = createStorage(undefined, { prefix: "focus-preview:" });
