import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { startBackgroundPaymentSync } from "@/lib/background-sync";
import { requireAdminAuth } from "@/lib/auth";
import { buildKaspaUri, isFiatCurrency } from "@/lib/kaspa";
import { createPayment, listPayments } from "@/lib/payment-store";
import { sendNotification } from "@/lib/notifications";
import { getKaspaQuote } from "@/lib/price";
import {
  MAX_FIAT_AMOUNT,
  getNumberField,
  getStringField,
  readJsonObject,
} from "@/lib/request-validation";

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  startBackgroundPaymentSync();

  return NextResponse.json({ payments: await listPayments() });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonObject(request);
    const fiatCurrency = getStringField(body, "fiatCurrency", {
      fallback: "KRW",
      maxLength: 3,
    }).toUpperCase();
    const amountBody = {
      ...body,
      fiatAmount: body.fiatAmount ?? body.krwAmount,
    };
    const fiatAmount = getNumberField(amountBody, "fiatAmount", {
      required: true,
      minExclusive: 0,
      maxInclusive: MAX_FIAT_AMOUNT,
    });

    if (fiatAmount === undefined) {
      throw new Error("fiatAmount is required.");
    }

    if (!isFiatCurrency(fiatCurrency)) {
      throw new Error("Unsupported fiat currency.");
    }

    const quote = await getKaspaQuote(fiatCurrency);
    const payment = await createPayment({
      merchantName: getStringField(body, "merchantName", {
        required: true,
        maxLength: 80,
      }),
      merchantAddress: getStringField(body, "merchantAddress", {
        required: true,
        maxLength: 96,
      }),
      fiatAmount,
      fiatCurrency: quote.fiatCurrency,
      rateFiatPerKas: quote.rateFiatPerKas,
    });
    startBackgroundPaymentSync();

    await appendAuditEvent({
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
    await appendAuditEvent({
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
