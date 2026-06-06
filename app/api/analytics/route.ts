import { NextResponse } from "next/server";

import { getSalesSummary } from "@/lib/payment-store";

export async function GET() {
  return NextResponse.json({
    summary: await getSalesSummary(),
    generatedAt: new Date().toISOString(),
  });
}
