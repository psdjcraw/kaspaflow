import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import {
  listWalletAddresses,
  setWalletAddressActive,
  upsertWalletAddress,
} from "@/lib/wallet-store";
import {
  getAction,
  getBooleanField,
  getObjectField,
  getStringField,
  readJsonObject,
} from "@/lib/request-validation";

const WALLET_ACTIONS = ["upsert", "status"] as const;

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  return NextResponse.json({ addresses: await listWalletAddresses() });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonObject(request);
    const action = getAction(body, WALLET_ACTIONS, "upsert");

    if (action === "status") {
      const walletId = getStringField(body, "id", {
        required: true,
        maxLength: 64,
      });
      const active = getBooleanField(body, "active", { required: true }) ??
        false;
      const addresses = await setWalletAddressActive(
        walletId,
        active,
      );
      await appendAuditEvent({
        type: "wallet.status",
        message: "Changed wallet address active status.",
        metadata: {
          walletId,
          active,
        },
      });

      return NextResponse.json({ addresses });
    }

    const addresses = await upsertWalletAddress(getObjectField(body, "address"));
    await appendAuditEvent({
      type: "wallet.upsert",
      message: "Updated wallet address book.",
    });

    return NextResponse.json({ addresses });
  } catch (error) {
    await appendAuditEvent({
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
