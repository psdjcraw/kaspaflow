import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth";
import { getSalesSummary } from "@/lib/payment-store";

export async function GET(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  return NextResponse.json({
    summary: await getSalesSummary(),
    generatedAt: new Date().toISOString(),
  });
}
