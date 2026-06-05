import { NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { expireExpiredPayments } from "@/lib/payment-store";

export async function POST() {
  const summary = expireExpiredPayments();

  if (summary.changed) {
    appendAuditEvent({
      type: "payments.expired",
      message: `Expired ${summary.changed} stale payments.`,
      metadata: {
        changed: summary.changed,
      },
    });
  }

  return NextResponse.json({ summary });
}
