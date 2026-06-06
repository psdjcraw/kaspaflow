import { NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import { expireExpiredPayments } from "@/lib/payment-store";

export async function POST(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  const summary = await expireExpiredPayments();

  if (summary.changed) {
    await appendAuditEvent({
      type: "payments.expired",
      message: `Expired ${summary.changed} stale payments.`,
      metadata: {
        changed: summary.changed,
      },
    });
  }

  return NextResponse.json({ summary });
}
