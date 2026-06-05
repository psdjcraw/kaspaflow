import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import {
  listWalletAddresses,
  setWalletAddressActive,
  upsertWalletAddress,
} from "@/lib/wallet-store";

export async function GET() {
  return NextResponse.json({ addresses: listWalletAddresses() });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await request.json();
    const action = String(body.action ?? "upsert");

    if (action === "status") {
      const addresses = setWalletAddressActive(
        String(body.id ?? ""),
        Boolean(body.active),
      );
      appendAuditEvent({
        type: "wallet.status",
        message: "Changed wallet address active status.",
        metadata: {
          walletId: String(body.id ?? ""),
          active: Boolean(body.active),
        },
      });

      return NextResponse.json({ addresses });
    }

    const addresses = upsertWalletAddress(body.address ?? {});
    appendAuditEvent({
      type: "wallet.upsert",
      message: "Updated wallet address book.",
    });

    return NextResponse.json({ addresses });
  } catch (error) {
    appendAuditEvent({
      type: "wallet.failed",
      message: error instanceof Error ? error.message : "Invalid wallet request.",
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid wallet request.",
      },
      { status: 400 },
    );
  }
}
