import "server-only";

import { runPaymentSync } from "@/lib/payment-sync-service";

type BackgroundSyncState = {
  enabled: boolean;
  intervalMs: number;
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
  startedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  lastSummary: {
    checked: number;
    changed: number;
  } | null;
};

declare global {
  var kaspaflowBackgroundSync: BackgroundSyncState | undefined;
}

const DEFAULT_INTERVAL_MS = 15_000;
const MIN_INTERVAL_MS = 5_000;

const state =
  globalThis.kaspaflowBackgroundSync ??
  (globalThis.kaspaflowBackgroundSync = {
    enabled: isBackgroundSyncEnabled(),
    intervalMs: getBackgroundSyncIntervalMs(),
    running: false,
    timer: null,
    startedAt: null,
    lastRunAt: null,
    lastError: null,
    lastSummary: null,
  });

export function startBackgroundPaymentSync() {
  state.enabled = isBackgroundSyncEnabled();
  state.intervalMs = getBackgroundSyncIntervalMs();

  if (!state.enabled || state.timer) {
    return getBackgroundSyncStatus();
  }

  state.startedAt = new Date().toISOString();
  void runBackgroundSyncOnce();
  state.timer = setInterval(() => {
    void runBackgroundSyncOnce();
  }, state.intervalMs);

  return getBackgroundSyncStatus();
}

export function getBackgroundSyncStatus() {
  return {
    enabled: state.enabled,
    intervalMs: state.intervalMs,
    running: state.running,
    startedAt: state.startedAt,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    lastSummary: state.lastSummary,
  };
}

async function runBackgroundSyncOnce() {
  if (state.running) {
    return;
  }

  state.running = true;
  state.lastRunAt = new Date().toISOString();
  state.lastError = null;

  try {
    const summary = await runPaymentSync({
      silent: true,
      source: "background",
    });
    state.lastSummary = {
      checked: summary.checked,
      changed: summary.changed,
    };
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "Unknown error.";
  } finally {
    state.running = false;
  }
}

function isBackgroundSyncEnabled() {
  return process.env.KASPAFLOW_BACKGROUND_SYNC_ENABLED !== "false";
}

function getBackgroundSyncIntervalMs() {
  const value = Number(process.env.KASPAFLOW_BACKGROUND_SYNC_INTERVAL_MS);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_INTERVAL_MS;
  }

  return Math.max(value, MIN_INTERVAL_MS);
}
