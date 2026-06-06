import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import { buildKaspaUri, type PaymentStatus } from "@/lib/kaspa";
import { getPayment, updatePaymentStatus } from "@/lib/payment-store";
import { sendNotification } from "@/lib/notifications";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const SIMULATED_STATUSES = [
  "seen",
  "confirmed",
  "underpaid",
  "overpaid",
  "expired",
] as const satisfies PaymentStatus[];

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  if (process.env.KASPAFLOW_ENABLE_SIMULATION !== "true") {
    return NextResponse.json(
      { error: "Payment simulation is disabled." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const payment = await getPayment(id);

  if (!payment) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const status = String(body.status ?? "confirmed") as PaymentStatus;

  if (!isSimulatedStatus(status)) {
    return NextResponse.json(
      { error: "Unsupported simulated payment status." },
      { status: 400 },
    );
  }

  const receivedKasAmount = getSimulatedKasAmount(body.receivedKasAmount, payment);
  const txHash = status === "expired"
    ? payment.txHash
    : String(
        body.txHash ??
          `simulated-${payment.id.toLowerCase()}-${Date.now().toString(36)}`,
      );

  const updatedPayment = await updatePaymentStatus(payment.id, status, {
    txHash,
    receivedKasAmount,
    simulated: true,
  });

  if (!updatedPayment) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }

  await appendAuditEvent({
    type: "payment.simulated",
    message: `Simulated payment ${payment.id} as ${status}.`,
    paymentId: payment.id,
    metadata: {
      status,
      kasAmount: receivedKasAmount,
    },
  });
  await sendNotification({
    type: "payment.simulated",
    message: `Simulated KaspaFlow payment ${payment.id} as ${status}.`,
    paymentId: payment.id,
    data: {
      status,
      kasAmount: receivedKasAmount,
    },
  });

  return NextResponse.json({
    payment: updatedPayment,
    kaspaUri: buildKaspaUri(updatedPayment),
  });
}

function isSimulatedStatus(status: PaymentStatus): status is (typeof SIMULATED_STATUSES)[number] {
  return SIMULATED_STATUSES.includes(
    status as (typeof SIMULATED_STATUSES)[number],
  );
}

function getSimulatedKasAmount(
  value: unknown,
  payment: Awaited<ReturnType<typeof getPayment>> extends infer T ? NonNullable<T> : never,
) {
  const parsed = Number(value);

  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return payment.kasAmount;
}
