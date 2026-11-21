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
import { createStudyStatsStore } from "../src/data/stats-store.js";
import { createStudyViews } from "../src/views/study-views.js";
import { normalizeStatsData, normalizeTimerSettings, validateBackupPayload, CURRENT_DATA_SCHEMA_VERSION, CURRENT_BACKUP_VERSION } from "../src/data/schema.js";
import { inspectRecoverySnapshots } from "../src/data/recovery.js";
import { writeStatsWithBackup } from "../src/data/transactions.js";
import { createTimerController } from "../src/features/timer-controller.js";
import { createAmbientSoundController } from "../src/features/ambient-sound.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const cssFiles = ["foundation.css", "study-room.css", "app-components.css", "device-layout.css", "study-room-visuals.css", "accessibility.css"];

const readStyles = async () => (await Promise.all([
  read("../src/styles/foundation.css"),
  read("../src/styles/study-room.css"),
  read("../src/styles/app-components.css"),
  read("../src/styles/device-layout.css"),
  read("../src/styles/study-room-visuals.css"),
  read("../src/styles/accessibility.css")
])).join("\n");

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

test("settings page provides a clear title and return path", async () => {
  const html = await read("../index.html");
  const start = html.indexOf('<div class="page" id="settingsPage"');
  const end = html.indexOf('<nav class="tabbar"', start);
  const settings = html.slice(start, end);
  assert.ok(settings.includes("<h2") && settings.includes("設定"));
  assert.ok(settings.includes('data-page="timerPage"'));
});

test("applying timer settings warns before resetting an active session", async () => {
  const script = await read("../src/main.js");
  const handler = script.slice(script.indexOf("$('apply').onclick"), script.indexOf("document.querySelectorAll('[data-page]')"));
  assert.ok(handler.includes("(running||remaining!==total)"));
  assert.ok(handler.includes("!confirm("));
  assert.ok(handler.includes("現在のセッションは最初から"));
});

test("interactive controls have visible keyboard focus and comfortable touch targets", async () => {
  const css = await readStyles();
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("button,summary{min-height:44px}"));
  assert.ok(css.includes(".tab{min-height:48px}"));
  assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
  assert.ok(css.includes("animation:none!important"));
});

test("timer display exposes timer semantics and decorative ring is hidden", async () => {
  const html = await read("../index.html");
  assert.ok(html.includes('id="clock" role="timer"'));
  assert.ok(html.includes('class="ring" viewBox="0 0 200 200" aria-hidden="true"'));
  assert.ok(html.includes('id="status" role="status" aria-live="polite"'));
  const script = await read("../src/main.js");
  assert.ok(script.includes("b.setAttribute('aria-pressed',String(active))"));
});

test("countdown intervals match the one-second display precision", async () => {
  const controller = await read("../src/features/timer-controller.js");
  assert.ok(controller.includes("schedule(tick, 1000)"));
  const hourglass = await read("../src/features/hourglass.js");
  assert.ok(hourglass.includes("window.setInterval(tick, 1000)"));
  assert.ok(!hourglass.includes("window.setInterval(tick, 250)"));
});

test("hourglass has visible falling-grain animation and viewBox-based sand scaling", async () => {
  const html = await read("../index.html");
  const css = await readStyles();
  assert.ok(css.includes("transform-box:view-box"));
  assert.ok(css.includes("@keyframes sand-flow"));
  assert.ok(css.includes("@keyframes sand-grain-fall"));
  assert.doesNotMatch(css, /\\n\\.hourglass/);
  assert.ok(html.includes('class="hourglass-grain grain-b"'));
  assert.ok(html.includes('class="hourglass-grain grain-c"'));
  assert.ok(css.includes(".hourglass-art.is-running .hourglass-grain"));
  assert.ok(css.includes(".hourglass-art.is-running .hourglass-stream{animation:none"));
});

test("hourglass CSS uses real rule separators and preview cache is versioned", async () => {
  const css = await readStyles();
  assert.doesNotMatch(css, /\\n\\.hourglass/);
  assert.ok(css.includes(".hourglass-grain{fill:var(--accent)"));
  assert.ok(css.includes(".hourglass-art.is-running .hourglass-grain{animation:sand-grain-fall"));
  const sw = await read("../public/sw.js");
  assert.ok(sw.includes("focus-preview-pwa-v3"));
});

test("calendar and analytics panels are mounted in their matching tabs", async () => {
  const html = await read("../index.html");
  const overviewStart = html.indexOf('<div class="page" id="overviewPage"');
  const calendarStart = html.indexOf('<div class="page" id="calendarPage"');
  const analyticsStart = html.indexOf('<div class="page" id="analyticsPage"');
  const roomStart = html.indexOf('<div class="page" id="studyRoomPage"');
  assert.ok(overviewStart >= 0 && calendarStart > overviewStart);
  assert.ok(analyticsStart > calendarStart && roomStart > analyticsStart);
  const overview = html.slice(overviewStart, calendarStart);
  const calendar = html.slice(calendarStart, analyticsStart);
  const analytics = html.slice(analyticsStart, roomStart);
  assert.ok(!overview.includes('id="calendarPanel"'));
  assert.ok(!overview.includes('id="analyticsPanel"'));
  assert.ok(calendar.includes('id="calendarPanel"'));
  assert.ok(analytics.includes('id="analyticsPanel"'));
  const script = await read("../src/main.js");
  assert.ok(script.includes("if(b.dataset.page==='calendarPage')renderCalendar()"));
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
  assert.ok(script.includes("./data/stats-store.js"), "statistics store should be imported");
  assert.ok(!script.includes("localStorage."), "app should use the storage adapter");
});

test("timer lifecycle is owned by its feature module and Study Room remains separated", async () => {
  const script = await read("../src/main.js");
  const controller = await read("../src/features/timer-controller.js");
  assert.ok(script.includes("./features/timer-controller.js"));
  assert.ok(script.includes("createTimerController("));
  assert.ok(script.includes("timerController.restore()"));
  assert.ok(controller.includes("export function createTimerController"));
  assert.ok(!script.includes("function startTimer("));
  assert.ok(!script.includes("function restoreTimerRuntime("));
  const hourglass = await read("../src/features/hourglass.js");
  const room = await read("../src/features/study-room.js");
  assert.ok(hourglass.includes("export function mountHourglass"));
  assert.ok(room.includes("export function mountStudyRoom"));
});

test("existing local storage keys are preserved", async () => {
  const script = await read("../src/main.js");
  const transactions = await read("../src/data/transactions.js");
  const statsStore = await read("../src/data/stats-store.js");
  const timerController = await read("../src/features/timer-controller.js");
  for (const key of [
    "focus-stats", "focus-notifications", "focus-timer-runtime",
    "focus-timer-settings", "focus-room-quiet-text",
    "focus-appearance", "focus-mark", "focus-preimport-backup", "focus-corrupt-stats-backup", "focus-pre-migration-backup", "focus-pre-recovery-raw-stats"
  ]) {
    assert.ok((script + transactions + statsStore + timerController).includes(key), "missing storage key: " + key);
  }
});

test("PWA manifest remains valid and standalone-capable", async () => {
  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  assert.equal(manifest.short_name, "FOCUS");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test("preview service worker caches extracted modules in its own namespace", async () => {
  const sw = await read("../public/sw.js");
  const cacheName = sw.match(/const CACHE='([^']+)'/)?.[1];
  assert.equal(cacheName, "focus-preview-pwa-v3");
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

test("preview Service Worker only manages preview-owned caches", async () => {
  const sw = await read("../public/sw.js");
  assert.ok(sw.includes("const CACHE='focus-preview-pwa-v3';"));
  assert.ok(sw.includes("const CACHE_PREFIX='focus-preview-';"));
  assert.ok(sw.includes("key.startsWith(CACHE_PREFIX) && key!==CACHE"));
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

test("startup restores timer only after statistics and completion callbacks are wired", async () => {
  const script = await read("../src/main.js");
  const statsLoad = script.indexOf("const statsLoad=statsStore.load()");
  const restore = script.indexOf("timerController.restore()");
  const controller = script.indexOf("timerController=createTimerController(");
  assert.ok(controller >= 0 && statsLoad > controller && restore > statsLoad);
  assert.ok(script.includes("onFocusComplete(){"), "focus completion callback must be registered before restore");
  assert.ok(script.includes("if(appReady){"), "startup completion must defer UI-only effects");
  assert.ok(script.includes("appReady=true;"), "UI becomes ready after initial rendering");
  const timer = await read("../src/features/timer-controller.js");
  assert.ok(timer.includes("Number.isFinite(Number(saved.deadline))"), "invalid persisted deadlines must not resume");
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

test("focus completion callback is the only session-record creation path", async () => {
  const script = await read("../src/main.js");
  const created = [...script.matchAll(/statsStore\.addSession\(record\)/g)];
  assert.equal(created.length, 1);
  assert.ok(script.includes("onFocusComplete(){"));
  assert.ok(script.includes("minutes:durations.focus"));
  assert.ok(script.includes("if(appReady){"));
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
  assert.ok(html.includes('href="./manifest.webmanifest"'));
  assert.ok(html.includes('href="./icon.svg"'));
  assert.ok(html.includes('href="./icon-192.png"'));
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


test("stats replacement requires a pre-import backup before writing new data", () => {
  const values = new Map([["focus-stats", JSON.stringify({ completed: 7 })]]);
  const store = {
    setJSON: (key, value) => { values.set(key, JSON.stringify(value)); return true; }
  };
  const result = writeStatsWithBackup(store, {
    backupPayload: { app: "FOCUS", version: 3 },
    statsPayload: { completed: 2 }
  });
  assert.deepEqual(result, { ok: true, stage: "complete" });
  assert.deepEqual(JSON.parse(values.get("focus-preimport-backup")), { app: "FOCUS", version: 3 });
  assert.deepEqual(JSON.parse(values.get("focus-stats")), { completed: 2 });
});

test("stats replacement aborts when the pre-import backup cannot be written", () => {
  const original = JSON.stringify({ completed: 7 });
  const values = new Map([["focus-stats", original]]);
  const store = {
    setJSON: (key, value) => {
      if (key === "focus-preimport-backup") return false;
      values.set(key, JSON.stringify(value)); return true;
    }
  };
  const result = writeStatsWithBackup(store, {
    backupPayload: { app: "FOCUS" }, statsPayload: { completed: 2 }
  });
  assert.deepEqual(result, { ok: false, stage: "backup" });
  assert.equal(values.get("focus-stats"), original);
});

test("stats replacement keeps the pre-import backup and old stats when the new write fails", () => {
  const original = JSON.stringify({ completed: 7 });
  const values = new Map([["focus-stats", original]]);
  const store = {
    setJSON: (key, value) => {
      if (key === "focus-stats") return false;
      values.set(key, JSON.stringify(value)); return true;
    }
  };
  const result = writeStatsWithBackup(store, {
    backupPayload: { app: "FOCUS", version: 3 }, statsPayload: { completed: 2 }
  });
  assert.deepEqual(result, { ok: false, stage: "stats" });
  assert.equal(values.get("focus-stats"), original);
  assert.deepEqual(JSON.parse(values.get("focus-preimport-backup")), { app: "FOCUS", version: 3 });
});


test("document head uses relative PWA asset paths for GitHub Pages subpaths", async () => {
  const html = await read("../index.html");
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /<link rel="icon" href="\.\/icon\.svg"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icon-192\.png"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:manifest\.webmanifest|icon\.svg|icon-192\.png)"/);
});


test("study room refresh preserves its structural class and visual state", async () => {
  const html = await read("../index.html");
  const main = await read("../src/main.js");
  assert.match(html, /class="study-room-view little-planet-view season-/);
  const room = await read("../src/features/study-room.js");
  assert.match(room, /for\(const name of \[\.\.\.view\.classList\]\)/);
  assert.ok(room.includes("view.classList.add('season-'+season.id,'time-'+time.id)"));
  assert.doesNotMatch(room, /view\.className\s*=/);
});

test("study room hourglass remains above decorative layers and accepts touch input", async () => {
  const css = await readStyles();
  const main = await read("../src/main.js");
  assert.ok(css.includes(".planet-hourglass{"));
  assert.ok(css.includes("z-index:30;pointer-events:auto;touch-action:manipulation"));
  assert.ok(css.includes(".desk-hourglass{pointer-events:auto;touch-action:manipulation"));
  const hourglass = await read("../src/features/hourglass.js");
  assert.ok(main.includes("mountHourglass({ getRemainingSeconds })"));
  assert.ok(hourglass.includes("button.addEventListener('click'"));
  assert.ok(hourglass.includes("button.addEventListener('pointerdown'"));
  assert.ok(hourglass.includes("window.setInterval(tick, 1000)"));
  assert.ok(hourglass.includes("getState: () => ({ duration, remaining, running, deadline })"));
});

test("Study Room hourglass uses its full visible surface as a clearly labeled button", async () => {
  const css = await readStyles();
  assert.ok(css.includes(".planet-hourglass .room-hourglass-shelf{"));
  assert.ok(css.includes("inset:0!important"));
  assert.ok(css.includes("width:100%!important;height:100%!important"));
  assert.ok(css.includes("transform:none!important"));
  assert.ok(css.includes(".planet-hourglass .desk-hourglass-time{display:block!important"));
  assert.ok(css.includes(".planet-hourglass .desk-hourglass-label{display:block!important"));
});

test("study room contains active celestial motion and a reduced-motion fallback", async () => {
  const css = await readStyles();
  assert.ok(css.includes("@keyframes star-twinkle"));
  assert.ok(css.includes("@keyframes nebula-breathe"));
  assert.ok(css.includes("@keyframes shooting-one"));
  assert.ok(css.includes("@keyframes room-butterfly-flight"));
  assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
  assert.ok(css.includes("cosmic-motion .wind-ribbons"));
});

test("hourglass countdown is isolated from the main application entry point", async () => {
  const main = await read("../src/main.js");
  const hourglass = await read("../src/features/hourglass.js");
  assert.ok(main.includes("import { mountHourglass } from './features/hourglass.js'"));
  assert.ok(main.includes("const hourglass = mountHourglass({ getRemainingSeconds })"));
  assert.doesNotMatch(main, /function (start|stop|tick|reset)Hourglass/);
  assert.ok(hourglass.includes("export function mountHourglass"));
  assert.ok(hourglass.includes("return { tick, reset, getState:"));
});


test("Study Room scene and weather logic are isolated in a feature module", async () => {
  const main = await read("../src/main.js");
  const room = await read("../src/features/study-room.js");
  assert.ok(main.includes("import { mountStudyRoom } from './features/study-room.js'"));
  assert.ok(main.includes("const studyRoom = mountStudyRoom({ updateSky: updateStudySky })"));
  assert.ok(main.includes("studyRoom.onVisible()"));
  assert.doesNotMatch(main, /function updateStudyRoom|function loadStudyRoomWeather|const studyRoomSeasons/);
  assert.ok(room.includes("export function mountStudyRoom"));
  assert.ok(room.includes("function applyWeather()"));
  assert.ok(room.includes("async function loadWeather(force=false)"));
  assert.ok(room.includes("function update()"));
  assert.ok(room.includes("weather-clear"));
});

test("Study Room keeps weather refresh, date updates, and sky progress connected", async () => {
  const main = await read("../src/main.js");
  const room = await read("../src/features/study-room.js");
  assert.ok(main.includes("studyRoom.update();studyRoom.loadWeather()"));
  assert.ok(main.includes("hourglass.tick();studyRoom.onVisible()"));
  assert.ok(room.includes("window.setInterval(update,60000)"));
  assert.ok(room.includes("updateSky();"));
  assert.ok(room.includes("studyRoomWeather').addEventListener('click'"));
});


test("textless Study Room mode keeps only the hourglass countdown visible", async () => {
  const css = await readStyles();
  const rule = css.split("\n").find(line => line.includes(".study-room-view.room-quiet-text .study-room-kicker"));
  assert.ok(rule);
  assert.ok(!rule.includes("desk-hourglass-time"));
  assert.ok(rule.includes("desk-hourglass-label{display:none!important}"));
  assert.ok(css.includes(".desk-hourglass-time{font-size:16px"));
});

test("CSS is split into ordered feature stylesheets without inline styles", async () => {
  const html = await read("../index.html");
  const entry = await read("../src/styles/main.css");
  const expected = cssFiles.map(name => `@import "./${name}";`).join("\n");
  assert.ok(html.includes('<link rel="stylesheet" href="./src/styles/main.css">'));
  assert.doesNotMatch(html, /<style(?:\\s|>)/i);
  assert.equal(entry.trim(), expected);
  const css = await readStyles();
  assert.ok(css.includes(":root{color-scheme:dark"));
  assert.ok(css.includes("@keyframes star-twinkle"));
  assert.ok(css.includes(":focus-visible"));
});

function createFakeTimerHarness(options = {}) {
  let now = options.now ?? 1000;
  let nextId = 1;
  const jobs = new Map();
  const values = new Map();
  const store = {
    getJSON: (key, fallback = null) => values.has(key) ? JSON.parse(values.get(key)) : fallback,
    setJSON: (key, value) => { values.set(key, JSON.stringify(value)); return true; }
  };
  const controller = createTimerController({
    durations: options.durations || { focus: 1, short: 1, long: 2 },
    getCycleLength: options.getCycleLength || (() => 2),
    getCompletedSessions: options.getCompletedSessions || (() => 1),
    store,
    now: () => now,
    schedule: (callback, delay) => { const id = nextId++; jobs.set(id, { callback, delay }); return id; },
    cancel: (id) => jobs.delete(id),
    onFocusComplete: options.onFocusComplete || (() => {}),
    onBreakComplete: options.onBreakComplete || (() => {}),
    onChange: options.onChange || (() => {})
  });
  return {
    controller, store, jobs,
    setNow(value) { now = value; },
    advance(milliseconds) { now += milliseconds; for (const job of [...jobs.values()]) job.callback(); },
    now: () => now
  };
}

test("timer controller starts, pauses, and persists a deadline-based runtime", () => {
  const h = createFakeTimerHarness();
  h.controller.start();
  assert.deepEqual(h.controller.getState(), {
    durations: { focus: 1, short: 1, long: 2 }, mode: "focus",
    remaining: 60, total: 60, running: true, deadline: 61000, finished: false
  });
  h.advance(12500);
  h.controller.pause();
  assert.equal(h.controller.getState().remaining, 48);
  assert.equal(h.controller.getState().running, false);
  assert.equal(h.store.getJSON("focus-timer-runtime").remaining, 48);
  assert.equal(h.jobs.size, 0);
});

test("focus completion records once and automatically starts the correct break", () => {
  let completed = 1;
  let focusCompletions = 0;
  const h = createFakeTimerHarness({
    getCompletedSessions: () => completed,
    onFocusComplete: () => { completed++; focusCompletions++; }
  });
  h.controller.start();
  h.advance(60000);
  const state = h.controller.getState();
  assert.equal(focusCompletions, 1);
  assert.equal(state.mode, "long");
  assert.equal(state.remaining, 120);
  assert.equal(state.running, true);
  assert.equal(state.finished, false);
});

test("break completion finishes without automatically starting another session", () => {
  let breakCompletions = 0;
  const h = createFakeTimerHarness({ onBreakComplete: () => breakCompletions++ });
  h.controller.setMode("short");
  h.controller.start();
  h.advance(60000);
  const state = h.controller.getState();
  assert.equal(breakCompletions, 1);
  assert.equal(state.mode, "short");
  assert.equal(state.remaining, 0);
  assert.equal(state.running, false);
  assert.equal(state.finished, true);
});

test("timer controller restores active and expired runtimes safely", () => {
  let activeCompleted = 1;
  const h = createFakeTimerHarness({ getCompletedSessions: () => activeCompleted, onFocusComplete: () => { activeCompleted++; } });
  h.store.setJSON("focus-timer-runtime", {
    mode: "focus", remaining: 30, deadline: h.now() + 30000,
    running: true, finished: false, updatedAt: h.now()
  });
  assert.equal(h.controller.restore(), true);
  assert.equal(h.controller.getState().running, true);
  h.advance(30000);
  assert.equal(h.controller.getState().mode, "long");

  let completions = 0;
  const expired = createFakeTimerHarness({ now: 100000, onFocusComplete: () => completions++ });
  expired.store.setJSON("focus-timer-runtime", {
    mode: "focus", remaining: 0, deadline: expired.now() - 1000,
    running: true, finished: false, updatedAt: expired.now() - 61000
  });
  expired.controller.restore();
  assert.equal(completions, 1);
  assert.equal(expired.controller.getState().running, true);
  assert.equal(expired.controller.getState().mode, "short");
});

test("timer controller resets, changes mode, skips, and applies durations", () => {
  const h = createFakeTimerHarness();
  h.controller.setDurations({ focus: 2, short: 1, long: 3 });
  assert.equal(h.controller.getState().remaining, 120);
  h.controller.setMode("long");
  assert.equal(h.controller.getState().remaining, 180);
  h.controller.skip();
  assert.equal(h.controller.getState().mode, "focus");
  h.controller.start();
  h.controller.reset();
  assert.equal(h.controller.getState().running, false);
  assert.equal(h.controller.getState().remaining, 120);
});

test("timer controller persists the current remaining time before page suspension", () => {
  const h = createFakeTimerHarness();
  h.controller.start();
  h.advance(10000);
  h.controller.persistCurrent();
  assert.equal(h.store.getJSON("focus-timer-runtime").remaining, 50);
  assert.equal(h.store.getJSON("focus-timer-runtime").running, true);
});

function createStatsHarness(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
  const storage = {
    getText: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    setText: (key, value) => { values.set(key, String(value)); return true; },
    getJSON(key, fallback = null) {
      const raw = this.getText(key, null);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    setJSON(key, value) { return this.setText(key, JSON.stringify(value)); }
  };
  const changes = [];
  const store = createStudyStatsStore({ storage, onChange: (state, meta) => changes.push({ state, meta }) });
  return { store, storage, values, changes };
}

test("study stats store migrates legacy data and protects the original snapshot", () => {
  const legacy = {
    completed: 3, minutes: 75,
    history: { "2026-11-20": 75 },
    records: [{ id: "s1", timestamp: 1795132800000, date: "2026-11-20", minutes: 25, note: "note" }],
    dailyGoal: 90, weeklyGoal: 400
  };
  const h = createStatsHarness({ "focus-stats": legacy });
  const loaded = h.store.load();
  assert.equal(loaded.writeBlocked, false);
  assert.equal(h.values.has("focus-pre-migration-backup"), true);
  assert.deepEqual(h.store.getState().completed, 3);
  assert.equal(h.store.getState().minutes, 75);
  assert.equal(h.store.getState().records.length, 1);
  assert.equal(h.store.getState().legacyCompleted, 2);
  assert.equal(h.storage.getJSON("focus-stats").schemaVersion, CURRENT_DATA_SCHEMA_VERSION);
});

test("study stats store adds sessions and keeps aggregate totals consistent after reload", () => {
  const h = createStatsHarness();
  h.store.load();
  h.store.addSession({ id: "new-1", timestamp: 1795219200000, date: "2026-11-21", minutes: 25, note: "" });
  const current = h.store.getState();
  assert.equal(current.completed, 1);
  assert.equal(current.minutes, 25);
  assert.equal(current.history["2026-11-21"], 25);
  const reloaded = createStudyStatsStore({ storage: h.storage });
  reloaded.load();
  assert.equal(reloaded.getState().completed, 1);
  assert.equal(reloaded.getState().minutes, 25);
});

test("study stats store edits notes and durations, and deletes records without mutating old snapshots", () => {
  const h = createStatsHarness();
  h.store.load();
  h.store.addSession({ id: "edit-1", timestamp: 1795219200000, date: "2026-11-21", minutes: 25, note: "" });
  const before = h.store.getState();
  h.store.updateRecord("edit-1", { minutes: 40, note: "reflection" });
  assert.equal(h.store.getState().minutes, 40);
  assert.equal(h.store.getState().records[0].note, "reflection");
  assert.equal(before.records[0].minutes, 25);
  h.store.deleteRecord("edit-1");
  assert.equal(h.store.getState().completed, 0);
  assert.equal(h.store.getState().minutes, 0);
});

test("clearing a day's detailed records preserves lifetime totals but clears that day's chart", () => {
  const h = createStatsHarness();
  h.store.load();
  h.store.addSession({ id: "day-1", timestamp: 1795219200000, date: "2026-11-21", minutes: 25, note: "" });
  h.store.clearDayRecords("2026-11-21");
  const state = h.store.getState();
  assert.equal(state.records.length, 0);
  assert.equal(state.completed, 1);
  assert.equal(state.minutes, 25);
  assert.equal(state.history["2026-11-21"], 0);
  const restored = createStudyStatsStore({ storage: h.storage });
  restored.load();
  assert.equal(restored.getState().completed, 1);
  assert.equal(restored.getState().minutes, 25);
  assert.equal(restored.getState().history["2026-11-21"], 0);
});

test("future stats schemas remain untouched and block normal writes", () => {
  const future = { schemaVersion: CURRENT_DATA_SCHEMA_VERSION + 1, custom: "preserve me" };
  const h = createStatsHarness({ "focus-stats": future });
  const loaded = h.store.load();
  assert.equal(loaded.writeBlocked, true);
  h.store.addSession({ id: "must-not-save", timestamp: 1795219200000, date: "2026-11-21", minutes: 25 });
  assert.deepEqual(h.storage.getJSON("focus-stats"), future);
  assert.equal(h.store.isWriteBlocked(), true);
});

test("failed migration backup blocks writes instead of overwriting unprotected data", () => {
  const values = new Map([["focus-stats", JSON.stringify({ completed: 2, minutes: 50, records: [] })]]);
  const storage = {
    getText: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    setText: (key, value) => key === "focus-pre-migration-backup" ? false : (values.set(key, String(value)), true),
    getJSON(key, fallback = null) { try { return JSON.parse(this.getText(key, null)) } catch { return fallback } },
    setJSON(key, value) { return this.setText(key, JSON.stringify(value)); }
  };
  const store = createStudyStatsStore({ storage });
  const loaded = store.load();
  assert.equal(loaded.writeBlocked, true);
  assert.equal(storage.getJSON("focus-stats").schemaVersion, undefined);
});

test("stats replacement is transactional and only publishes after successful persistence", () => {
  const h = createStatsHarness();
  h.store.load();
  const before = h.store.getState();
  const result = h.store.replaceStats({
    records: [{ id: "replace-1", timestamp: 1795219200000, date: "2026-11-21", minutes: 30 }],
    legacyCompleted: 1, legacyMinutes: 10, legacyHistory: {}, dailyGoal: 100, weeklyGoal: 500
  }, { backupKey: "focus-preimport-backup", backupPayload: { app: "FOCUS", version: 3 } });
  assert.equal(result.ok, true);
  assert.equal(h.store.getState().completed, 2);
  assert.equal(h.store.getState().minutes, 40);
  assert.equal(h.values.has("focus-preimport-backup"), true);
  assert.equal(before.completed, 0);

  const failValues = new Map();
  const failStorage = {
    getText: (key, fallback = null) => failValues.has(key) ? failValues.get(key) : fallback,
    setText: (key, value) => key === "focus-preimport-backup" ? false : (failValues.set(key, String(value)), true),
    getJSON(key, fallback = null) { try { return JSON.parse(this.getText(key, null)) } catch { return fallback } },
    setJSON(key, value) { return this.setText(key, JSON.stringify(value)); }
  };
  const failed = createStudyStatsStore({ storage: failStorage });
  failed.load();
  const prior = failed.getState();
  const rejected = failed.replaceStats({ records: [] }, { backupKey: "focus-preimport-backup", backupPayload: {} });
  assert.deepEqual(rejected, { ok: false, stage: "backup" });
  assert.equal(failed.getState().completed, prior.completed);
});

function createViewHarness() {
  const elements = new Map();
  const makeElement = () => ({
    innerHTML: "", textContent: "", classList: { toggle() {}, add() {}, remove() {} }
  });
  const root = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; }
  };
  return { root, elements, views: createStudyViews({ root }) };
}

test("study views render weekly totals and goal progress from supplied data only", () => {
  const h = createViewHarness();
  const now = new Date(2026, 10, 21, 12);
  const history = { "2026-11-21": 75, "2026-11-20": 25 };
  const week = h.views.renderWeekly({ history, now });
  assert.equal(week.length, 7);
  assert.equal(h.elements.get("todayMinutes").textContent, 75);
  assert.equal(h.elements.get("weekTotal").textContent, "1時間40分");
  h.views.renderGoals({ history, dailyGoal: 90, weeklyGoal: 180, now });
  assert.match(h.elements.get("goalProgress").innerHTML, /75 \/ 90分/);
  assert.match(h.elements.get("goalProgress").innerHTML, /100 \/ 180分/);
});

test("study views render calendar dates and escape reflection text in history", () => {
  const h = createViewHarness();
  const history = { "2026-11-21": 45 };
  h.views.renderCalendar({ history, cursor: new Date(2026, 10, 1) });
  assert.equal(h.elements.get("calendarTitle").textContent, "2026年 11月");
  assert.match(h.elements.get("calendarGrid").innerHTML, /title="45分"/);
  h.views.renderHistory({
    records: [{ id: "safe-id", timestamp: 1795219200000, minutes: 25, note: "<script>alert(1)</script>" }]
  });
  const html = h.elements.get("historyList").innerHTML;
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data-record-edit="safe-id"/);
});

test("study analytics views build 14-day, 12-week, and 12-month ranges", () => {
  const h = createViewHarness();
  const history = { "2026-11-21": 30, "2026-11-20": 20 };
  const now = new Date(2026, 10, 21, 12);
  const day = h.views.renderAnalytics({ history, range: "day", now });
  const week = h.views.renderAnalytics({ history, range: "week", now });
  const month = h.views.renderAnalytics({ history, range: "month", now });
  assert.equal(day.length, 14);
  assert.equal(week.length, 12);
  assert.equal(month.length, 12);
  assert.equal(day.reduce((sum, item) => sum + item.value, 0), 50);
});

test("main delegates study presentation to the dedicated views module", async () => {
  const script = await read("../src/main.js");
  assert.ok(script.includes("createStudyViews"));
  assert.ok(script.includes("studyViews.renderWeekly"));
  assert.ok(script.includes("studyViews.renderCalendar"));
  assert.ok(script.includes("studyViews.renderHistory"));
  assert.ok(script.includes("studyViews.renderAnalytics"));
  assert.ok(!script.includes("function renderCalendar(){const y="));
  assert.ok(!script.includes("function renderAnalytics(){const now="));
});


function createFakeAudioHarness(options = {}) {
  const buttons = new Map();
  const presetButtons = ['rainy','breeze','quiet','off'].map(soundPreset => ({
    dataset: { soundPreset },
    selected: false,
    classList: { toggle(name, value) { if (name === 'selected') this.selected = value; }, remove() { this.selected = false; } }
  }));
  const root = {
    querySelector(selector) {
      const match = selector.match(/data-sound="([^"]+)"/);
      if (!match) return null;
      const kind = match[1];
      if (!buttons.has(kind)) buttons.set(kind, {
        dataset: { sound: kind }, pressed: 'false', selected: false,
        setAttribute(name, value) { if (name === 'aria-pressed') this.pressed = value; },
        classList: { toggle(name, value) { if (name === 'selected') buttons.get(kind).selected = value; }, remove() { buttons.get(kind).selected = false; } }
      });
      return buttons.get(kind);
    },
    querySelectorAll(selector) {
      if (selector === '[data-sound-preset]') return presetButtons;
      if (selector === '[data-sound]') return [...buttons.values()];
      return [];
    }
  };
  const sources = [];
  const gains = [];
  class FakeAudioContext {
    constructor() { this.sampleRate = 4; this.currentTime = 10; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createBuffer(channels, size, rate) {
      const data = new Float32Array(size);
      return { getChannelData: () => data };
    }
    createBufferSource() {
      const source = { loop: false, stoppedAt: null, connect(next) { this.next = next; }, start() { this.started = true; }, stop(at) { this.stoppedAt = at; } };
      sources.push(source);
      return source;
    }
    createBiquadFilter() { return { frequency: {}, connect(next) { this.next = next; } }; }
    createGain() {
      const gain = { gain: { value: 0, setTargetAtTime(value, time, constant) { this.target = [value,time,constant]; } }, connect(next) { this.next = next; } };
      gains.push(gain);
      return gain;
    }
  }
  let unsupported = 0;
  const controller = createAmbientSoundController({
    root,
    getAudioContextConstructor: () => options.unsupported ? null : FakeAudioContext,
    getVolume: () => options.volume ?? 0.6,
    onUnsupported: () => unsupported++,
    random: () => 0.75
  });
  return { controller, buttons, presetButtons, sources, gains, unsupported: () => unsupported };
}

test("ambient sound controller toggles layers and updates accessible button state", () => {
  const h = createFakeAudioHarness();
  h.controller.toggle('rain');
  assert.deepEqual(h.controller.getActiveLayers(), ['rain']);
  assert.equal(h.buttons.get('rain').pressed, 'true');
  assert.equal(h.sources[0].loop, true);
  h.controller.toggle('rain');
  assert.deepEqual(h.controller.getActiveLayers(), []);
  assert.equal(h.buttons.get('rain').pressed, 'false');
  assert.equal(h.sources[0].stoppedAt, 10.5);
});

test("ambient sound presets replace layers and volume changes reach every active layer", () => {
  const h = createFakeAudioHarness();
  h.controller.setPreset('rainy');
  assert.deepEqual(h.controller.getActiveLayers(), ['rain','noise']);
  assert.equal(h.presetButtons.find(button => button.dataset.soundPreset === 'rainy').selected, true);
  h.controller.setVolume(0.4);
  assert.deepEqual(h.gains.map(gain => gain.gain.target), [[0.2,10,0.08],[0.2,10,0.08]]);
  h.controller.setPreset('off');
  assert.deepEqual(h.controller.getActiveLayers(), []);
  assert.ok(h.sources.every(source => source.stoppedAt === 10.5));
  assert.equal(h.presetButtons.every(button => !button.selected), true);
});

test("ambient sound controller reports unsupported audio and stops all layers on destroy", () => {
  const unsupported = createFakeAudioHarness({ unsupported: true });
  unsupported.controller.toggle('wind');
  assert.equal(unsupported.unsupported(), 1);
  assert.deepEqual(unsupported.controller.getActiveLayers(), []);

  const h = createFakeAudioHarness();
  h.controller.setLayer('wind', true);
  h.controller.setLayer('noise', true);
  h.controller.destroy();
  assert.deepEqual(h.controller.getActiveLayers(), []);
  assert.ok(h.sources.every(source => source.stoppedAt === 10.5));
});

test("main delegates ambient sound controls to the dedicated controller", async () => {
  const script = await read("../src/main.js");
  assert.ok(script.includes("createAmbientSoundController"));
  assert.ok(script.includes("ambientSound.setPreset"));
  assert.ok(script.includes("ambientSound.setVolume"));
  assert.doesNotMatch(script, /const ambientLayers=\{\}/);
});
