import { NextResponse } from "next/server";

import { getKaspaQuote } from "@/lib/price";

export async function GET(request: Request) {
  const url = new URL(request.url);

  return NextResponse.json(await getKaspaQuote(url.searchParams.get("fiat") ?? "KRW"));
}
