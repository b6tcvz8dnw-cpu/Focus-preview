import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  formatClock,
  dateKey,
  buildWeekData,
  getStudySkyLevel
} from "../src/core/date-time.js";
import { createStorage } from "../src/data/storage.js";
import { getRemainingSeconds, getNextBreakMode } from "../src/core/timer.js";
import { calculateStats } from "../src/data/records.js";
import { normalizeStatsData, normalizeTimerSettings, validateBackupPayload, CURRENT_DATA_SCHEMA_VERSION, CURRENT_BACKUP_VERSION } from "../src/data/schema.js";
import { inspectRecoverySnapshots } from "../src/data/recovery.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("main document has a valid Japanese HTML shell", async () => {
  const html = await read("../index.html");
  assert.ok(html.toLowerCase().includes("<!doctype html>"));
  assert.ok(html.includes('<html lang="ja">'));
  assert.ok(html.includes("viewport-fit=cover"));
  assert.ok(html.includes("<title>FOCUS"));
});

test("all HTML IDs are unique", async () => {
  const html = await read("../index.html");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test("essential pages and controls remain present", async () => {
  const html = await read("../index.html");
  for (const id of [
    "timerPage", "overviewPage", "calendarPage", "analyticsPage",
    "studyRoomPage", "settingsPage", "start", "reset", "hourglassStart",
    "hourglassSandTop", "hourglassSandBottom", "exportData", "importData"
  ]) {
    assert.ok(html.includes('id="' + id + '"'), "missing #" + id);
  }
});

test("HTML loads the external application module and its source parses", async () => {
  const html = await read("../index.html");
  assert.ok(html.includes('<script type="module" src="./src/main.js"></script>'));
  const script = await read("../src/main.js");
  const executable = script.replace(/^\s*import\s+[^;]+;\s*/gm, "");
  assert.doesNotThrow(() => new vm.Script(executable, { filename: "src/main.js" }));
  assert.ok(script.includes("./core/date-time.js"), "date-time module should be imported");
  assert.ok(script.includes("./data/storage.js"), "storage module should be imported");
  assert.ok(script.includes("./core/timer.js"), "timer module should be imported");
  assert.ok(script.includes("./data/records.js"), "record module should be imported");
  assert.ok(!script.includes("localStorage."), "app should use the storage adapter");
});

test("core timer and Study Room functions remain present", async () => {
  const script = await read("../src/main.js");
  for (const name of [
    "startTimer", "persistTimer", "restoreTimerRuntime", "complete",
    "tick", "startHourglass", "updateStudyRoom", "updateStudySky",
    "loadStudyRoomWeather"
  ]) {
    assert.ok(script.includes("function " + name + "("), "missing function " + name);
  }
});

test("existing local storage keys are preserved", async () => {
  const script = await read("../src/main.js");
  for (const key of [
    "focus-stats", "focus-notifications", "focus-timer-runtime",
    "focus-timer-settings", "focus-room-quiet-text",
    "focus-appearance", "focus-mark", "focus-preimport-backup", "focus-corrupt-stats-backup", "focus-pre-migration-backup", "focus-pre-recovery-raw-stats"
  ]) {
    assert.ok(script.includes(key), "missing storage key: " + key);
  }
});

test("PWA manifest remains valid and standalone-capable", async () => {
  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  assert.equal(manifest.short_name, "FOCUS");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test("service worker caches all extracted modules with a new version", async () => {
  const sw = await read("../public/sw.js");
  const cacheName = sw.match(/const CACHE='([^']+)'/)?.[1];
  assert.equal(cacheName, "focus-pwa-v41");
  for (const asset of [
    "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"
  ]) {
    assert.ok(sw.includes(asset), "service worker should cache " + asset);
  }
  assert.ok(sw.includes("caches.match"), "service worker should have a cache lookup");
});

test("formatClock keeps the existing MM:SS display contract", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(9), "00:09");
  assert.equal(formatClock(65), "01:05");
  assert.equal(formatClock(1500), "25:00");
});

test("dateKey uses local calendar fields and zero padding", () => {
  assert.equal(dateKey(new Date(2026, 0, 3, 23, 59)), "2026-01-03");
  assert.equal(dateKey(new Date(2026, 10, 21)), "2026-11-21");
});

test("buildWeekData returns seven chronological days without mutating history", () => {
  const history = { "2026-11-19": 25, "2026-11-21": 40 };
  const original = structuredClone(history);
  const week = buildWeekData(history, new Date(2026, 10, 21, 12));
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((day) => day.key), [
    "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18",
    "2026-11-19", "2026-11-20", "2026-11-21"
  ]);
  assert.equal(week[4].minutes, 25);
  assert.equal(week[6].minutes, 40);
  assert.deepEqual(history, original);
});

test("buildWeekData normalizes invalid or negative stored minutes", () => {
  const week = buildWeekData({
    "2026-11-20": -5,
    "2026-11-21": "not-a-number"
  }, new Date(2026, 10, 21, 12));
  assert.equal(week[5].minutes, 0);
  assert.equal(week[6].minutes, 0);
});

test("Study Room sky progression preserves all existing thresholds", () => {
  assert.equal(getStudySkyLevel(0), 0);
  assert.equal(getStudySkyLevel(29), 0);
  assert.equal(getStudySkyLevel(30), 1);
  assert.equal(getStudySkyLevel(59), 1);
  assert.equal(getStudySkyLevel(60), 2);
  assert.equal(getStudySkyLevel(119), 2);
  assert.equal(getStudySkyLevel(120), 3);
  assert.equal(getStudySkyLevel(179), 3);
  assert.equal(getStudySkyLevel(180), 4);
});

test("storage adapter reads and writes text and JSON", () => {
  const values = new Map();
  const fakeStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
  const store = createStorage(() => fakeStorage);
  assert.equal(store.getText("missing", "fallback"), "fallback");
  assert.equal(store.setText("theme", "night"), true);
  assert.equal(store.getText("theme"), "night");
  assert.equal(store.setJSON("settings", { focus: 25 }), true);
  assert.deepEqual(store.getJSON("settings"), { focus: 25 });
});

test("storage adapter supports a dedicated namespace without changing default keys", () => {
  const data = new Map();
  const fakeStorage = {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value))
  };
  const preview = createStorage(() => fakeStorage, { prefix: "focus-preview:" });
  const production = createStorage(() => fakeStorage);

  assert.equal(preview.setText("focus-stats", "preview"), true);
  assert.equal(production.getText("focus-stats", null), null);
  assert.equal(preview.getText("focus-stats"), "preview");
  assert.equal(data.get("focus-preview:focus-stats"), "preview");
  assert.equal(production.setText("focus-stats", "production"), true);
  assert.equal(production.getText("focus-stats"), "production");
  assert.equal(preview.getText("focus-stats"), "preview");
});

test("storage adapter safely handles malformed JSON and unavailable storage", () => {
  const fakeStorage = {
    getItem: () => "{broken",
    setItem: () => { throw new Error("quota exceeded"); }
  };
  const store = createStorage(() => fakeStorage);
  assert.deepEqual(store.getJSON("broken", { safe: true }), { safe: true });
  assert.equal(store.setText("blocked", "value"), false);
  const unavailable = createStorage(() => { throw new Error("storage blocked"); });
  assert.equal(unavailable.getText("key", "fallback"), "fallback");
  assert.equal(unavailable.setText("key", "value"), false);
});

test("getRemainingSeconds uses an absolute deadline and never goes below zero", () => {
  assert.equal(getRemainingSeconds(11000, 1000), 10);
  assert.equal(getRemainingSeconds(1000, 1000), 0);
  assert.equal(getRemainingSeconds(0, 1000), 0);
});

test("getNextBreakMode preserves short and long break cycle behavior", () => {
  assert.equal(getNextBreakMode(1, 4), "short");
  assert.equal(getNextBreakMode(3, 4), "short");
  assert.equal(getNextBreakMode(4, 4), "long");
  assert.equal(getNextBreakMode(8, 4), "long");
  assert.equal(getNextBreakMode(6, 3), "long");
});

test("calculateStats rebuilds totals and date buckets without mutating inputs", () => {
  const legacyHistory = { "2026-11-20": 12 };
  const records = [
    { date: "2026-11-20", timestamp: new Date(2026, 10, 20).getTime(), minutes: 25 },
    { date: "2026-11-21", timestamp: new Date(2026, 10, 21).getTime(), minutes: 30 }
  ];
  const totals = calculateStats({
    legacyCompleted: 2,
    legacyMinutes: 40,
    legacyHistory,
    records
  });
  assert.equal(totals.completed, 4);
  assert.equal(totals.minutes, 95);
  assert.equal(totals.history["2026-11-20"], 37);
  assert.equal(totals.history["2026-11-21"], 30);
  assert.deepEqual(legacyHistory, { "2026-11-20": 12 });
  assert.equal(records[0].minutes, 25);
});


test("legacy unversioned stats migrate without losing aggregate history", () => {
  const migrated = normalizeStatsData({
    completed: 5,
    minutes: 125,
    history: { "2026-11-20": 100, "2026-11-21": 25, invalid: 900 },
    records: [
      { id: "a", timestamp: new Date(2026, 10, 20, 12).getTime(), date: "2026-11-20", minutes: 25, note: "memo" },
      { id: "b", timestamp: new Date(2026, 10, 21, 12).getTime(), date: "2026-11-21", minutes: 25 }
    ],
    dailyGoal: 90,
    weeklyGoal: 400
  });
  assert.equal(migrated.schemaVersion, CURRENT_DATA_SCHEMA_VERSION);
  assert.equal(migrated.legacyCompleted, 3);
  assert.equal(migrated.legacyMinutes, 75);
  assert.deepEqual(migrated.legacyHistory, { "2026-11-20": 75, "2026-11-21": 0 });
  assert.equal(migrated.records.length, 2);
  assert.equal(migrated.dailyGoal, 90);
  assert.equal(migrated.weeklyGoal, 400);
});

test("schema migration discards malformed records and normalizes invalid goals", () => {
  const migrated = normalizeStatsData({
    completed: -4,
    minutes: "NaN",
    history: { "2026-11-21": -10, "2026-02-30": 20 },
    records: [
      { id: "bad", timestamp: "not-a-date", minutes: 20 },
      { id: "too-long", timestamp: 1790000000000, minutes: 121 },
      { id: "good", timestamp: 1790000000000, minutes: 30, note: "x".repeat(2100) }
    ],
    dailyGoal: -1,
    weeklyGoal: 999999
  });
  assert.equal(migrated.records.length, 1);
  assert.equal(migrated.records[0].note.length, 2000);
  assert.equal(migrated.dailyGoal, 60);
  assert.equal(migrated.weeklyGoal, 300);
  assert.deepEqual(migrated.legacyHistory, { "2026-11-21": 0 });
});

test("existing version-2 JSON backups remain import-compatible", () => {
  const result = validateBackupPayload({
    app: "FOCUS",
    version: 2,
    stats: {
      completed: 2,
      minutes: 50,
      history: { "2026-11-21": 50 },
      records: [
        { id: "old-1", timestamp: 1795262400000, date: "2026-11-21", minutes: 25 },
        { id: "old-2", timestamp: 1795266000000, date: "2026-11-21", minutes: 25 }
      ],
      dailyGoal: 60,
      weeklyGoal: 300
    },
    timerSettings: { focus: 25, short: 5, long: 15, cycle: 4 },
    appearance: { theme: "green" },
    mark: "star",
    notificationsEnabled: true,
    quietText: false
  });
  assert.equal(result.valid, true);
  assert.equal(result.data.version, CURRENT_BACKUP_VERSION);
  assert.equal(result.data.stats.records.length, 2);
  assert.deepEqual(result.data.timerSettings, { focus: 25, short: 5, long: 15, cycle: 4 });
});

test("backup validation rejects unsupported versions and invalid settings before import", () => {
  const base = { app: "FOCUS", version: 3, stats: { records: [] } };
  assert.equal(validateBackupPayload({ ...base, version: 99 }).valid, false);
  assert.equal(validateBackupPayload({ ...base, timerSettings: { focus: 0, short: 5, long: 15, cycle: 4 } }).valid, false);
  assert.equal(validateBackupPayload({ ...base, appearance: { theme: "unknown" } }).valid, false);
  assert.equal(validateBackupPayload({ app: "OTHER", version: 3, stats: { records: [] } }).valid, false);
});

test("timer settings normalizer accepts only bounded integer settings", () => {
  assert.deepEqual(normalizeTimerSettings({ focus: 25, short: 5, long: 15, cycle: 4 }), {
    focus: 25, short: 5, long: 15, cycle: 4
  });
  assert.equal(normalizeTimerSettings({ focus: 0, short: 5, long: 15, cycle: 4 }), null);
});


test("timer boundary calculations handle rounding, elapsed deadlines, and invalid values", () => {
  assert.equal(getRemainingSeconds(2000, 1000), 1);
  assert.equal(getRemainingSeconds(2001, 1000), 2);
  assert.equal(getRemainingSeconds(1999, 1000), 1);
  assert.equal(getRemainingSeconds(999, 1000), 0);
  assert.equal(getRemainingSeconds(Number.NaN, 1000), 0);
  assert.equal(getRemainingSeconds(Number.POSITIVE_INFINITY, 1000), 0);
  assert.equal(getRemainingSeconds(2000, Number.NaN), 0);
});

test("break selection handles invalid counters and cycle boundaries", () => {
  assert.equal(getNextBreakMode(0, 4), "short");
  assert.equal(getNextBreakMode(4, 4), "long");
  assert.equal(getNextBreakMode(5, 4), "short");
  assert.equal(getNextBreakMode(8, 4), "long");
  assert.equal(getNextBreakMode(Number.NaN, 4), "short");
  assert.equal(getNextBreakMode(4, Number.POSITIVE_INFINITY), "long");
});

test("record aggregation ignores duplicate IDs and invalid minute values", () => {
  const result = calculateStats({
    legacyCompleted: 1,
    legacyMinutes: 10,
    legacyHistory: { "2026-11-21": 10 },
    records: [
      { id: "same", date: "2026-11-21", minutes: 25 },
      { id: "same", date: "2026-11-21", minutes: 25 },
      { id: "bad", date: "2026-11-21", minutes: Number.NaN },
      { id: "negative", date: "2026-11-21", minutes: -5 },
      { date: "2026-11-21", minutes: 5 }
    ]
  });
  assert.equal(result.completed, 5);
  assert.equal(result.minutes, 40);
  assert.equal(result.history["2026-11-21"], 40);
});

test("data normalization drops duplicate session IDs instead of counting them twice", () => {
  const normalized = normalizeStatsData({
    completed: 2,
    minutes: 50,
    history: { "2026-11-21": 50 },
    records: [
      { id: "same", timestamp: 1795262400000, date: "2026-11-21", minutes: 25 },
      { id: "same", timestamp: 1795266000000, date: "2026-11-21", minutes: 25 }
    ]
  });
  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.legacyCompleted, 1);
  assert.equal(normalized.legacyMinutes, 25);
});

test("storage adapter round-trips runtime state and protects failed writes", () => {
  const values = new Map();
  const fakeStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
  const store = createStorage(() => fakeStorage);
  const runtime = {
    mode: "focus",
    remaining: 300,
    deadline: 1795262700000,
    running: true,
    finished: false,
    updatedAt: 1795262400000
  };
  assert.equal(store.setJSON("focus-timer-runtime", runtime), true);
  assert.deepEqual(store.getJSON("focus-timer-runtime"), runtime);
  const blocked = createStorage(() => ({
    getItem: () => null,
    setItem: () => { throw new Error("quota exceeded"); }
  }));
  assert.equal(blocked.setJSON("focus-stats", { records: [] }), false);
});

test("startup restores expired timer only after completion recording is wired", async () => {
  const script = await read("../src/main.js");
  const wrapper = script.indexOf("const originalComplete=complete;");
  const restore = script.indexOf("restoreTimerRuntime();");
  assert.ok(wrapper >= 0 && wrapper < restore, "completion wrapper must be registered before timer restoration");
  assert.ok(script.includes("if(appReady){"), "startup completion must defer UI-only effects");
  assert.ok(script.includes("appReady=true;"), "UI becomes ready after initial rendering");
  assert.ok(script.includes("Number.isFinite(Number(saved.deadline))"), "invalid persisted deadlines must not resume");
});

test("screen navigation and direct DOM references resolve to existing page elements", async () => {
  const html = await read("../index.html");
  const script = await read("../src/main.js");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const references = [...script.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
  const missing = [...new Set(references.filter((id) => !ids.has(id)))];
  assert.deepEqual(missing, [], "all direct DOM ID lookups should exist in the HTML");
  const pageTargets = [...html.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]);
  for (const target of pageTargets) {
    assert.ok(ids.has(target), "navigation target should exist: " + target);
    assert.ok(new RegExp('id="' + target + '"[^>]*class="[^"]*page').test(html)
      || new RegExp('class="[^"]*page[^"]*"[^>]*id="' + target + '"').test(html),
      "navigation target should be a page: " + target);
  }
});

test("timer completion wrapper is the only session-record creation path", async () => {
  const script = await read("../src/main.js");
  const created = [...script.matchAll(/records\.push\(r\)/g)];
  assert.equal(created.length, 1);
  assert.ok(script.includes("minutes:durations.focus"));
  assert.ok(script.includes("save();if(appReady)"));
});

test("backup validation round-trips normalized session history", () => {
  const source = {
    app: "FOCUS",
    version: CURRENT_BACKUP_VERSION,
    stats: {
      completed: 2,
      minutes: 50,
      history: { "2026-11-21": 50 },
      records: [
        { id: "one", timestamp: 1795262400000, date: "2026-11-21", minutes: 25 },
        { id: "two", timestamp: 1795266000000, date: "2026-11-21", minutes: 25 }
      ]
    },
    timerSettings: { focus: 25, short: 5, long: 15, cycle: 4 },
    mark: "dot"
  };
  const exported = validateBackupPayload(source);
  assert.equal(exported.valid, true);
  const imported = validateBackupPayload(exported.data);
  assert.equal(imported.valid, true);
  assert.equal(imported.data.stats.records.length, 2);
  assert.equal(imported.data.stats.legacyMinutes, 0);
});


test("Vite keeps the GitHub Pages project path relative", async () => {
  const config = await read("../vite.config.js");
  assert.match(config, /base:\s*["']\.\/["']/);
  assert.match(config, /outDir:\s*["']dist["']/);
  assert.match(config, /publicDir:\s*["']public["']/);
  const html = await read("../index.html");
  assert.ok(html.includes('href="/manifest.webmanifest"'));
  assert.ok(html.includes('href="/icon.svg"'));
  assert.ok(html.includes('href="/icon-192.png"'));
});

test("production build injects generated bundles into the PWA precache", async () => {
  const buildScript = await read("../scripts/build.mjs");
  const serviceWorker = await read("../public/sw.js");
  assert.ok(buildScript.includes("const BUILD_ASSETS = []"));
  assert.ok(buildScript.includes("FOCUS build verified"));
  assert.ok(buildScript.includes("precacheAssets"));
  assert.ok(serviceWorker.includes("const BUILD_ASSETS = [];"));
  assert.ok(serviceWorker.includes("...BUILD_ASSETS"));
});

test("package scripts expose development, build, and preview commands", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.scripts.dev, "vite --host 0.0.0.0");
  assert.equal(pkg.scripts.build, "node scripts/build.mjs");
  assert.equal(pkg.scripts.preview, "vite preview --host 0.0.0.0");
  assert.equal(pkg.devDependencies.vite, "6.4.6");
});


test("recovery inspection exposes restorable snapshots and preserves corrupt originals", () => {
  const values = new Map([
    ["focus-preimport-backup", JSON.stringify({
      app: "FOCUS", version: 2,
      stats: { completed: 1, minutes: 25, history: { "2026-11-21": 25 }, records: [] }
    })],
    ["focus-pre-migration-backup", JSON.stringify({
      completed: 2, minutes: 50, history: { "2026-11-21": 50 }, records: []
    })],
    ["focus-corrupt-stats-backup", "{broken"]
  ]);
  const store = {
    getText: (key, fallback = null) => values.has(key) ? values.get(key) : fallback
  };
  const items = inspectRecoverySnapshots(store);
  const imported = items.find(item => item.key === "focus-preimport-backup");
  const migrated = items.find(item => item.key === "focus-pre-migration-backup");
  const corrupt = items.find(item => item.key === "focus-corrupt-stats-backup");
  assert.equal(imported.restorable, true);
  assert.equal(imported.stats.legacyCompleted, 1);
  assert.equal(migrated.restorable, true);
  assert.equal(migrated.stats.legacyMinutes, 50);
  assert.equal(corrupt.available, true);
  assert.equal(corrupt.restorable, false);
  assert.equal(corrupt.rawText, "{broken");
});

test("recovery inspection refuses to downgrade a future data schema", () => {
  const store = {
    getText: (key, fallback = null) => key === "focus-pre-migration-backup"
      ? JSON.stringify({ schemaVersion: CURRENT_DATA_SCHEMA_VERSION + 1, records: [] })
      : fallback
  };
  const item = inspectRecoverySnapshots(store).find(entry => entry.key === "focus-pre-migration-backup");
  assert.equal(item.available, true);
  assert.equal(item.restorable, false);
});

test("settings expose recovery controls and main wires safe restore/export actions", async () => {
  const html = await read("../index.html");
  const main = await read("../src/main.js");
  assert.ok(html.includes('id="recoveryList"'));
  assert.ok(html.includes("復旧用データの確認・復元"));
  assert.ok(main.includes("focus-pre-recovery-raw-stats"));
  assert.ok(main.includes("復元直前のデータを保護できなかったため、復元を中止"));
  assert.ok(main.includes("downloadRecoverySnapshot"));
  assert.ok(main.includes("restoreRecoverySnapshot"));
});


test("recovery exposes future-version live stats as downloadable but never restorable", () => {
  const futurePayload = JSON.stringify({
    schemaVersion: CURRENT_DATA_SCHEMA_VERSION + 1,
    records: [{ id: "future", minutes: 25 }]
  });
  const store = {
    getText: (key, fallback = null) => key === "focus-stats" ? futurePayload : fallback
  };
  const item = inspectRecoverySnapshots(store).find(entry => entry.key === "focus-current-protected-stats");
  assert.equal(item.available, true);
  assert.equal(item.restorable, false);
  assert.equal(item.rawText, futurePayload);
  assert.match(item.status, /新しい形式/);
});


test("recovery exposes malformed live stats as export-only raw data", () => {
  const malformed = "{partial-current-json";
  const store = {
    getText: (key, fallback = null) => key === "focus-stats" ? malformed : fallback
  };
  const item = inspectRecoverySnapshots(store).find(entry => entry.key === "focus-current-protected-stats");
  assert.equal(item.available, true);
  assert.equal(item.restorable, false);
  assert.equal(item.rawText, malformed);
  assert.match(item.status, /正常に解析できません/);
});
