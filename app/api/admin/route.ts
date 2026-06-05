import { NextRequest, NextResponse } from "next/server";

import {
  getMerchantSettings,
  setEmployeeActive,
  updateMerchantSettings,
  upsertEmployee,
} from "@/lib/merchant-store";

export async function GET() {
  return NextResponse.json({ settings: getMerchantSettings() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "settings");

    if (action === "employee") {
      return NextResponse.json({
        settings: upsertEmployee(body.employee ?? {}),
      });
    }

    if (action === "employee-status") {
      return NextResponse.json({
        settings: setEmployeeActive(
          String(body.id ?? ""),
          Boolean(body.active),
        ),
      });
    }

    return NextResponse.json({
      settings: updateMerchantSettings({
        merchantName: body.merchantName,
        merchantAddress: body.merchantAddress,
        defaultCurrency: body.defaultCurrency,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid admin request.",
      },
      { status: 400 },
    );
  }
}
