import "server-only";

import { appendAuditEvent } from "@/lib/audit-store";
import { sendNotification } from "@/lib/notifications";
import { syncOpenPaymentsFromWatcher } from "@/lib/watcher";

export type PaymentSyncSource = "manual" | "background";

export type RunPaymentSyncOptions = {
  silent?: boolean;
  source?: PaymentSyncSource;
};

export async function runPaymentSync({
  silent = false,
  source = "manual",
}: RunPaymentSyncOptions = {}) {
  const summary = await syncOpenPaymentsFromWatcher();
  const message = `Synced ${summary.checked} open payments, ${summary.changed} changed.`;

  if (!silent || summary.changed > 0) {
    await appendAuditEvent({
      type: "payments.sync",
      message,
      metadata: {
        checked: summary.checked,
        changed: summary.changed,
        silent,
        source,
      },
    });
    await sendNotification({
      type: "payments.sync",
      message,
      data: {
        checked: summary.checked,
        changed: summary.changed,
        silent,
        source,
      },
    });
  }

  for (const result of summary.results.filter((entry) =>
    entry.beforeStatus !== entry.afterStatus
  )) {
    await appendAuditEvent({
      type: "payment.status-changed",
      message: `Payment ${result.id} changed from ${result.beforeStatus} to ${result.afterStatus}.`,
      paymentId: result.id,
      metadata: {
        beforeStatus: result.beforeStatus,
        afterStatus: result.afterStatus,
        receivedKasAmount: result.receivedKasAmount ?? null,
        source,
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
        source,
      },
    });
  }

  return summary;
}
