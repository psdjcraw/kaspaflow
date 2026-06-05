import { NextResponse } from "next/server";

import { getKaspaQuote } from "@/lib/price";

export async function GET() {
  return NextResponse.json(getKaspaQuote());
}
