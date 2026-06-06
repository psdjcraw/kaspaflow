import { NextResponse } from "next/server";

import { isAdminAuthEnabled, isAdminAuthRequired } from "@/lib/auth";
import { getKaspaNetwork, getKaspaRestApiUrl } from "@/lib/kaspa-network";
import { getKaspaQuote } from "@/lib/price";
import { getStorageStatus } from "@/lib/storage-provider";

export async function GET() {
  const storage = getStorageStatus();
  const backgroundSync = storage.ready
    ? await getFileStorageBackgroundSyncStatus()
    : {
        enabled: false,
        intervalMs: 0,
        running: false,
        startedAt: null,
        lastRunAt: null,
        lastError: storage.note,
        lastSummary: null,
      };

  return NextResponse.json({
    ok: true,
    service: "kaspaflow",
    kaspaNetwork: getKaspaNetwork(),
    kaspaRestApiUrl: getKaspaRestApiUrl(),
    storageProvider: storage.provider,
    storage,
    watcherMode: process.env.KASPA_WATCHER_MODE ?? "mock",
    backgroundSync,
    adminAuthEnabled: isAdminAuthEnabled(),
    adminAuthRequired: isAdminAuthRequired(),
    simulationEnabled: process.env.KASPAFLOW_ENABLE_SIMULATION === "true",
    quote: await getKaspaQuote(),
    checkedAt: new Date().toISOString(),
  });
}

async function getFileStorageBackgroundSyncStatus() {
  const {
    getBackgroundSyncStatus,
    startBackgroundPaymentSync,
  } = await import("@/lib/background-sync");

  startBackgroundPaymentSync();
  return getBackgroundSyncStatus();
}
