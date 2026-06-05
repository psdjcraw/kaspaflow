import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { startBackgroundPaymentSync } from "@/lib/background-sync";
import { requireAdminAuth } from "@/lib/auth";
import { buildKaspaUri } from "@/lib/kaspa";
import { createPayment, listPayments } from "@/lib/payment-store";
import { sendNotification } from "@/lib/notifications";
import { getKaspaQuote } from "@/lib/price";

export async function GET() {
  startBackgroundPaymentSync();

  return NextResponse.json({ payments: listPayments() });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await request.json();
    const quote = await getKaspaQuote(String(body.fiatCurrency ?? "KRW"));
    const payment = createPayment({
      merchantName: String(body.merchantName ?? ""),
      merchantAddress: String(body.merchantAddress ?? ""),
      fiatAmount: Number(body.fiatAmount ?? body.krwAmount),
      fiatCurrency: quote.fiatCurrency,
      rateFiatPerKas: quote.rateFiatPerKas,
    });
    startBackgroundPaymentSync();

    appendAuditEvent({
      type: "payment.created",
      message: `Created payment ${payment.id}.`,
      paymentId: payment.id,
      metadata: {
        fiatAmount: payment.fiatAmount,
        fiatCurrency: payment.fiatCurrency,
        kasAmount: payment.kasAmount,
      },
    });
    await sendNotification({
      type: "payment.created",
      message: `New KaspaFlow payment ${payment.id} created.`,
      paymentId: payment.id,
      data: {
        fiatAmount: payment.fiatAmount,
        fiatCurrency: payment.fiatCurrency,
        kasAmount: payment.kasAmount,
      },
    });

    return NextResponse.json(
      {
        payment,
        quote,
        kaspaUri: buildKaspaUri(payment),
      },
      { status: 201 },
    );
  } catch (error) {
    appendAuditEvent({
      type: "payment.create-failed",
      message: error instanceof Error ? error.message : "Invalid request.",
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request.",
      },
      { status: 400 },
    );
  }
}
