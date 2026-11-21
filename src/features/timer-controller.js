import { getRemainingSeconds, getNextBreakMode } from "../core/timer.js";

const DEFAULT_DURATIONS = Object.freeze({ focus: 25, short: 5, long: 15 });
const VALID_MODES = new Set(["focus", "short", "long"]);

/**
 * Owns the timer lifecycle and persistence independently from the DOM.
 * UI, statistics, notifications, and sounds are supplied through callbacks.
 */
export function createTimerController({
  durations = DEFAULT_DURATIONS,
  getCycleLength = () => 4,
  getCompletedSessions = () => 0,
  store,
  onChange = () => {},
  onFocusComplete = () => {},
  onBreakComplete = () => {},
  now = () => Date.now(),
  schedule = (callback, delay) => setInterval(callback, delay),
  cancel = (handle) => clearInterval(handle)
} = {}) {
  let config = { ...DEFAULT_DURATIONS, ...durations };
  let mode = "focus";
  let remaining = config.focus * 60;
  let total = remaining;
  let running = false;
  let deadline = 0;
  let interval = null;
  let finished = false;
  let pageVisible = true;

  const snapshot = () => ({
    durations: { ...config }, mode, remaining, total, running, deadline, finished
  });

  function emit() {
    onChange(snapshot());
  }

  function persist() {
    try {
      store?.setJSON("focus-timer-runtime", {
        mode, remaining, deadline, running, finished, updatedAt: now()
      });
    } catch {}
  }

  function scheduleTick() {
    if (pageVisible && running && interval === null) interval = schedule(tick, 1000);
  }

  function stop() {
    if (interval !== null) cancel(interval);
    interval = null;
    running = false;
    persist();
  }

  function start() {
    if (remaining <= 0) remaining = config[mode] * 60;
    finished = false;
    running = true;
    deadline = now() + remaining * 1000;
    if (interval !== null) cancel(interval);
    interval = null;
    scheduleTick();
    persist();
    emit();
  }

  function complete() {
    const endedMode = mode;
    stop();
    remaining = 0;

    if (endedMode === "focus") {
      onFocusComplete();
      mode = getNextBreakMode(getCompletedSessions(), getCycleLength());
      finished = false;
      remaining = config[mode] * 60;
      total = remaining;
      start();
      return;
    }

    finished = true;
    persist();
    emit();
    onBreakComplete();
  }

  function tick() {
    if (!running) return;
    remaining = getRemainingSeconds(deadline, now());
    if (remaining <= 0) complete();
    else emit();
  }

  function pause() {
    if (!running) return false;
    remaining = getRemainingSeconds(deadline, now());
    stop();
    emit();
    return true;
  }

  function reset() {
    stop();
    finished = false;
    remaining = config[mode] * 60;
    total = remaining;
    persist();
    emit();
  }

  function setMode(nextMode) {
    if (!VALID_MODES.has(nextMode)) return false;
    stop();
    mode = nextMode;
    finished = false;
    remaining = config[mode] * 60;
    total = remaining;
    persist();
    emit();
    return true;
  }

  function setDurations(nextDurations) {
    config = { ...config, ...nextDurations };
    stop();
    finished = false;
    remaining = config[mode] * 60;
    total = remaining;
    persist();
    emit();
  }

  function skip() {
    const nextMode = mode === "focus"
      ? getNextBreakMode(Number(getCompletedSessions()) + 1, getCycleLength())
      : "focus";
    return setMode(nextMode);
  }

  function restore() {
    let saved;
    try {
      saved = store?.getJSON("focus-timer-runtime", null);
    } catch {
      return false;
    }
    if (!saved || !VALID_MODES.has(saved.mode)) return false;

    mode = saved.mode;
    finished = !!saved.finished;
    total = config[mode] * 60;

    if (saved.running && Number.isFinite(Number(saved.deadline)) && Number(saved.deadline) > 0) {
      running = true;
      deadline = Number(saved.deadline);
      remaining = getRemainingSeconds(deadline, now());
      if (remaining > 0) {
        scheduleTick();
        emit();
      } else {
        running = false;
        complete();
      }
    } else {
      running = false;
      const savedRemaining = Number(saved.remaining);
      remaining = Number.isFinite(savedRemaining)
        ? Math.max(0, Math.min(total, savedRemaining))
        : total;
      emit();
    }
    return true;
  }

  function setVisible(visible) {
    pageVisible = !!visible;
    if (!pageVisible) {
      if (interval !== null) cancel(interval);
      interval = null;
      persistCurrent();
      return;
    }
    scheduleTick();
  }

  function persistCurrent() {
    if (running) remaining = getRemainingSeconds(deadline, now());
    persist();
  }

  function destroy() {
    if (interval !== null) cancel(interval);
    interval = null;
    running = false;
  }

  return {
    getState: snapshot,
    start,
    pause,
    tick,
    reset,
    setMode,
    setDurations,
    skip,
    restore,
    persistCurrent,
    setVisible,
    destroy
  };
}
