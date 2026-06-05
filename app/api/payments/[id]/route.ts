import { NextResponse } from "next/server";

import { buildKaspaUri } from "@/lib/kaspa";
import { syncPaymentFromWatcher } from "@/lib/watcher";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const payment = syncPaymentFromWatcher(id);

  if (!payment) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }

  return NextResponse.json({
    payment,
    kaspaUri: buildKaspaUri(payment),
  });
}
