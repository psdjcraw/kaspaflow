import { NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { buildKaspaUri } from "@/lib/kaspa";
import { sendNotification } from "@/lib/notifications";
import { getPayment } from "@/lib/payment-store";
import { syncPaymentFromWatcher } from "@/lib/watcher";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const beforePayment = await getPayment(id);
  const payment = await syncPaymentFromWatcher(id);

  if (!payment) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }

  if (beforePayment && beforePayment.status !== payment.status) {
    await appendAuditEvent({
      type: "payment.status-changed",
      message: `Payment ${payment.id} changed from ${beforePayment.status} to ${payment.status}.`,
      paymentId: payment.id,
      metadata: {
        beforeStatus: beforePayment.status,
        afterStatus: payment.status,
        receivedKasAmount: payment.receivedKasAmount ?? null,
      },
    });
    await sendNotification({
      type: "payment.status-changed",
      message: `KaspaFlow payment ${payment.id} changed from ${beforePayment.status} to ${payment.status}.`,
      paymentId: payment.id,
      data: {
        beforeStatus: beforePayment.status,
        afterStatus: payment.status,
        receivedKasAmount: payment.receivedKasAmount,
      },
    });
  }

  return NextResponse.json({
    payment,
    kaspaUri: buildKaspaUri(payment),
  });
}
