import { NextResponse } from "next/server";

import {
  buildKaspaRestUrl,
  getKaspaNetwork,
  getKaspaRestApiUrl,
} from "@/lib/kaspa-network";

export async function GET() {
  const baseUrl = getKaspaRestApiUrl();
  const [health, blockdag] = await Promise.all([
    fetchKaspaEndpoint("/info/health"),
    fetchKaspaEndpoint("/info/blockdag"),
  ]);

  return NextResponse.json({
    network: getKaspaNetwork(),
    restApiUrl: baseUrl,
    ok: health.ok && blockdag.ok,
    health,
    blockdag,
    checkedAt: new Date().toISOString(),
  });
}

async function fetchKaspaEndpoint(pathname: string) {
  const startedAt = Date.now();
  const url = buildKaspaRestUrl(pathname);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Request failed.",
    };
  }
}
