import { NextResponse } from "next/server";

import { getSalesSummary } from "@/lib/payment-store";

export async function GET() {
  return NextResponse.json({
    summary: getSalesSummary(),
    generatedAt: new Date().toISOString(),
  });
}
