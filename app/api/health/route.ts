import { NextResponse } from "next/server";

import { isAdminAuthEnabled } from "@/lib/auth";
import {
  getBackgroundSyncStatus,
  startBackgroundPaymentSync,
} from "@/lib/background-sync";
import { getKaspaNetwork, getKaspaRestApiUrl } from "@/lib/kaspa-network";
import { getKaspaQuote } from "@/lib/price";

export async function GET() {
  startBackgroundPaymentSync();

  return NextResponse.json({
    ok: true,
    service: "kaspaflow",
    kaspaNetwork: getKaspaNetwork(),
    kaspaRestApiUrl: getKaspaRestApiUrl(),
    watcherMode: process.env.KASPA_WATCHER_MODE ?? "mock",
    backgroundSync: getBackgroundSyncStatus(),
    adminAuthEnabled: isAdminAuthEnabled(),
    simulationEnabled: process.env.KASPAFLOW_ENABLE_SIMULATION === "true",
    quote: await getKaspaQuote(),
    checkedAt: new Date().toISOString(),
  });
}
