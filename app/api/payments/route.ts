import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { buildKaspaUri } from "@/lib/kaspa";
import { createPayment, listPayments } from "@/lib/payment-store";
import { getKaspaQuote } from "@/lib/price";

export async function GET() {
  return NextResponse.json({ payments: listPayments() });
}

export async function POST(request: NextRequest) {
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

    return NextResponse.json(
      {
        payment,
        quote,
        kaspaUri: buildKaspaUri(payment),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request.",
      },
      { status: 400 },
    );
  }
}
