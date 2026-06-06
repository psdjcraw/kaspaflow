import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import { isKaspaAddress } from "@/lib/kaspa";
import { sendNotification } from "@/lib/notifications";
import { getPayment, updatePaymentRefund } from "@/lib/payment-store";
import {
  MAX_KAS_AMOUNT,
  getNumberField,
  getStringField,
  readJsonObject,
} from "@/lib/request-validation";
import { verifyRefundTransaction } from "@/lib/watcher";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  try {
    const { id } = await context.params;
    const payment = await getPayment(id);

    if (!payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    const body = await readJsonObject(request);
    const customerAddress = getStringField(body, "customerAddress", {
      required: true,
      maxLength: 96,
    });
    const txHash = getStringField(body, "txHash", { maxLength: 128 });
    const kasAmount = getNumberField(body, "kasAmount", {
      fallback: payment.receivedKasAmount ?? payment.kasAmount,
      minExclusive: 0,
      maxInclusive: MAX_KAS_AMOUNT,
    }) ?? payment.kasAmount;

    if (!isKaspaAddress(customerAddress)) {
      return NextResponse.json(
        { error: "A valid customer Kaspa address is required." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(kasAmount) || kasAmount <= 0) {
      return NextResponse.json(
        { error: "Refund KAS amount must be greater than zero." },
        { status: 400 },
      );
    }

    if (txHash && !/^[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { error: "Refund transaction hash must be 64 hexadecimal characters." },
        { status: 400 },
      );
    }

    const refund = {
      status: txHash ? "tx-provided" as const : "requested" as const,
      customerAddress,
      kasAmount,
      reason: getStringField(body, "reason", { maxLength: 200 }) || undefined,
      requestedAt: payment.refund?.requestedAt ?? new Date().toISOString(),
      txHash: txHash || payment.refund?.txHash,
      checkedAt: txHash ? new Date().toISOString() : payment.refund?.checkedAt,
    };

    const nextPayment = await updatePaymentRefund(id, refund);
    await appendAuditEvent({
      type: txHash ? "refund.tx-provided" : "refund.requested",
      message: txHash
        ? `Refund transaction provided for ${id}.`
        : `Refund requested for ${id}.`,
      paymentId: id,
      metadata: {
        kasAmount,
      },
    });
    await sendNotification({
      type: txHash ? "refund.tx-provided" : "refund.requested",
      message: txHash
        ? `Refund transaction provided for ${id}.`
        : `Refund requested for ${id}.`,
      paymentId: id,
      data: {
        kasAmount,
      },
    });

    if (!nextPayment || !txHash) {
      return NextResponse.json({ payment: nextPayment });
    }

    return NextResponse.json({
      payment: await verifyAndStoreRefund(id, txHash, customerAddress, kasAmount),
    });
  } catch (error) {
    await appendAuditEvent({
      type: "refund.failed",
      message: error instanceof Error ? error.message : "Invalid refund request.",
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid refund request.",
      },
      { status: 400 },
    );
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authError = requireAdminAuth(_request);

  if (authError) {
    return authError;
  }

  const { id } = await context.params;
  const payment = await getPayment(id);
  const refund = payment?.refund;

  if (!payment || !refund?.txHash || !refund.customerAddress || !refund.kasAmount) {
    return NextResponse.json({ payment });
  }

  return NextResponse.json({
    payment: await verifyAndStoreRefund(
      id,
      refund.txHash,
      refund.customerAddress,
      refund.kasAmount,
    ),
  });
}

async function verifyAndStoreRefund(
  paymentId: string,
  txHash: string,
  customerAddress: string,
  kasAmount: number,
) {
  const verification = await verifyRefundTransaction(
    txHash,
    customerAddress,
    kasAmount,
  );
  const now = new Date().toISOString();
  await appendAuditEvent({
    type: `refund.${verification.status}`,
    message: verification.note,
    paymentId,
    metadata: {
      kasAmount,
    },
  });
  await sendNotification({
    type: `refund.${verification.status}`,
    message: verification.note,
    paymentId,
    data: {
      kasAmount,
    },
  });

  return updatePaymentRefund(paymentId, {
    status: verification.status,
    txHash,
    customerAddress,
    kasAmount,
    checkedAt: now,
    confirmedAt: verification.status === "confirmed" ? now : undefined,
    note: verification.note,
  });
}
