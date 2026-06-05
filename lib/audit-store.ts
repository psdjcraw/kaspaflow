import "server-only";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type AuditEvent = {
  id: string;
  type: string;
  message: string;
  paymentId?: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type AuditState = {
  events: AuditEvent[];
};

declare global {
  var kaspaflowAuditStore: AuditState | undefined;
}

const auditStore =
  globalThis.kaspaflowAuditStore ??
  (globalThis.kaspaflowAuditStore = loadAuditStore());

export function listAuditEvents(limit = 30) {
  return auditStore.events
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function appendAuditEvent(
  event: Omit<AuditEvent, "id" | "createdAt">,
) {
  const nextEvent: AuditEvent = {
    ...event,
    id: `AUD-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  };

  auditStore.events.unshift(nextEvent);
  auditStore.events = auditStore.events.slice(0, 500);
  persistAuditStore();
  return nextEvent;
}

function getAuditStorePath() {
  const dataDir =
    process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data");

  return path.join(dataDir, "audit-events.json");
}

function loadAuditStore(): AuditState {
  const storePath = getAuditStorePath();

  if (!existsSync(storePath)) {
    return { events: [] };
  }

  try {
    return JSON.parse(readFileSync(storePath, "utf8")) as AuditState;
  } catch {
    return { events: [] };
  }
}

function persistAuditStore() {
  const storePath = getAuditStorePath();
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(`${storePath}.tmp`, JSON.stringify(auditStore, null, 2));
  renameSync(`${storePath}.tmp`, storePath);
}
