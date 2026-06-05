import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth";
import { runPaymentSync } from "@/lib/payment-sync-service";

export async function POST(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  const silent = new URL(request.url).searchParams.get("silent") === "1";
  const summary = await runPaymentSync({ silent, source: "manual" });

  return NextResponse.json({ summary });
}
