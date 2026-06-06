import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import {
  buildKaspaTransferUri,
  isKaspaAddress,
} from "@/lib/kaspa";
import { getKaspaNetwork } from "@/lib/kaspa-network";

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await request.json();
    const toAddress = String(body.toAddress ?? "").trim();
    const kasAmount = Number(body.kasAmount);
    const label = String(body.label ?? "KaspaFlow testnet send").trim();
    const network = getKaspaNetwork();

    if (!isKaspaAddress(toAddress)) {
      return NextResponse.json(
        { error: "A valid Kaspa address is required." },
        { status: 400 },
      );
    }

    if (network === "testnet-10" && !toAddress.startsWith("kaspatest:")) {
      return NextResponse.json(
        { error: "testnet-10 send handoff requires a kaspatest: address." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(kasAmount) || kasAmount <= 0) {
      return NextResponse.json(
        { error: "KAS amount must be greater than zero." },
        { status: 400 },
      );
    }

    const handoff = {
      id: `TS-${Date.now().toString(36).toUpperCase()}`,
      network,
      toAddress,
      kasAmount,
      label,
      kaspaUri: buildKaspaTransferUri(toAddress, kasAmount, label),
      createdAt: new Date().toISOString(),
      custody: "non-custodial",
      note: "KaspaFlow does not hold private keys. Sign and broadcast this request in a wallet.",
    };

    await appendAuditEvent({
      type: "testnet.send-handoff",
      message: `Created testnet send handoff ${handoff.id}.`,
      metadata: {
        kasAmount,
        network,
      },
    });

    return NextResponse.json({ handoff }, { status: 201 });
  } catch (error) {
    await appendAuditEvent({
      type: "testnet.send-failed",
      message: error instanceof Error ? error.message : "Invalid send request.",
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid send request.",
      },
      { status: 400 },
    );
  }
}
