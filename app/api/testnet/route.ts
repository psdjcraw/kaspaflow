/**
 * testnet API endpoint
 * GET /api/testnet?mode=health|balance|tx&address=...|txId=...
 */

import { NextResponse } from "next/server";

import {
  buildTestnetChecklist,
  fetchBalance,
  fetchTransactionDetail,
  testnetHealthCheck,
  validateAddress,
} from "@/lib/testnet-validator";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "checklist";
  
  switch (mode) {
    case "checklist": {
      const address = url.searchParams.get("address") ?? undefined;
      return NextResponse.json(await buildTestnetChecklist(address));
    }

    case "health": {
      const health = await testnetHealthCheck();
      return NextResponse.json(health);
    }

    case "balance": {
      const address = url.searchParams.get("address");
      if (!address) {
        return NextResponse.json({ error: "address required" }, { status: 400 });
      }
      const info = validateAddress(address);
      if (!info.isValid) {
        return NextResponse.json({ 
          error: "Invalid address", 
          isValid: false, 
          isTestnet: info.isTestnet 
        }, { status: 400 });
      }
      const balance = await fetchBalance(address);
      return NextResponse.json({ ...balance, address });
    }

    case "tx": {
      const txId = url.searchParams.get("txId");
      if (!txId) {
        return NextResponse.json({ error: "txId required" }, { status: 400 });
      }
      const detail = await fetchTransactionDetail(txId);
      if (!detail) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }
      return NextResponse.json(detail);
    }

    default:
      return NextResponse.json({
        modes: ["checklist", "health", "balance", "tx"],
        network: process.env.KASPA_NETWORK || "mainnet",
      });
  }
}
