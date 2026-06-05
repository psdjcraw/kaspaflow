import { NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notifications";
import { syncOpenPaymentsFromWatcher } from "@/lib/watcher";

export async function POST(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  const silent = new URL(request.url).searchParams.get("silent") === "1";
  const summary = await syncOpenPaymentsFromWatcher();

  if (!silent || summary.changed > 0) {
    appendAuditEvent({
      type: "payments.sync",
      message: `Synced ${summary.checked} open payments, ${summary.changed} changed.`,
      metadata: {
        checked: summary.checked,
        changed: summary.changed,
        silent,
      },
    });
    await sendNotification({
      type: "payments.sync",
      message: `Synced ${summary.checked} open payments, ${summary.changed} changed.`,
      data: {
        checked: summary.checked,
        changed: summary.changed,
        silent,
      },
    });
  }

  for (const result of summary.results.filter((entry) =>
    entry.beforeStatus !== entry.afterStatus
  )) {
    appendAuditEvent({
      type: "payment.status-changed",
      message: `Payment ${result.id} changed from ${result.beforeStatus} to ${result.afterStatus}.`,
      paymentId: result.id,
      metadata: {
        beforeStatus: result.beforeStatus,
        afterStatus: result.afterStatus,
        receivedKasAmount: result.receivedKasAmount ?? null,
      },
    });
    await sendNotification({
      type: "payment.status-changed",
      message: `KaspaFlow payment ${result.id} changed from ${result.beforeStatus} to ${result.afterStatus}.`,
      paymentId: result.id,
      data: {
        beforeStatus: result.beforeStatus,
        afterStatus: result.afterStatus,
        receivedKasAmount: result.receivedKasAmount,
      },
    });
  }

  return NextResponse.json({ summary });
}
