import { NextResponse } from "next/server";

import { isAdminAuthEnabled } from "@/lib/auth";
import { getKaspaQuote } from "@/lib/price";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "kaspaflow",
    watcherMode: process.env.KASPA_WATCHER_MODE ?? "mock",
    adminAuthEnabled: isAdminAuthEnabled(),
    quote: await getKaspaQuote(),
    checkedAt: new Date().toISOString(),
  });
}
