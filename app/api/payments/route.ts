import { NextRequest, NextResponse } from "next/server";

import { buildKaspaUri } from "@/lib/kaspa";
import { createPayment, listPayments } from "@/lib/payment-store";
import { getKaspaQuote } from "@/lib/price";

export async function GET() {
  return NextResponse.json({ payments: listPayments() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const quote = getKaspaQuote();
    const payment = createPayment({
      merchantName: String(body.merchantName ?? ""),
      merchantAddress: String(body.merchantAddress ?? ""),
      krwAmount: Number(body.krwAmount),
      rateKrwPerKas: quote.rateKrwPerKas,
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
