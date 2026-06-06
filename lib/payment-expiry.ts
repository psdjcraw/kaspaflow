import "server-only";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { assertFileStorageProvider } from "./storage-provider";

interface ExpiryState {
  lastRun: string;
  expiredIds: string[];
}

function getStatePath(): string {
  assertFileStorageProvider("payment-expiry");
  const dataDir =
    process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data");

  return path.join(dataDir, "expiry-state.json");
}

export function loadExpiryState(): ExpiryState {
  const filePath = getStatePath();

  if (!existsSync(filePath)) {
    return { lastRun: "", expiredIds: [] };
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as ExpiryState;
  } catch {
    return { lastRun: "", expiredIds: [] };
  }
}

export function saveExpiryState(state: ExpiryState): void {
  const filePath = getStatePath();
  const tmpPath = `${filePath}.tmp`;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, filePath);
}

export function markExpired(ids: string[]): void {
  const state = loadExpiryState();
  state.expiredIds.push(...ids.filter((id) => !state.expiredIds.includes(id)));
  state.lastRun = new Date().toISOString();
  saveExpiryState(state);
}

export function getExpiryStats(): { lastRun: string; count: number } {
  const state = loadExpiryState();
  return { lastRun: state.lastRun, count: state.expiredIds.length };
}
