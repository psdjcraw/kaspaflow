import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
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
      const settings = upsertEmployee(body.employee ?? {});
      appendAuditEvent({
        type: "admin.employee",
        message: "Updated merchant employee list.",
      });

      return NextResponse.json({
        settings,
      });
    }

    if (action === "employee-status") {
      const settings = setEmployeeActive(
        String(body.id ?? ""),
        Boolean(body.active),
      );
      appendAuditEvent({
        type: "admin.employee-status",
        message: "Changed employee active status.",
        metadata: {
          employeeId: String(body.id ?? ""),
          active: Boolean(body.active),
        },
      });

      return NextResponse.json({
        settings,
      });
    }

    const settings = updateMerchantSettings({
      merchantName: body.merchantName,
      merchantAddress: body.merchantAddress,
      defaultCurrency: body.defaultCurrency,
    });
    appendAuditEvent({
      type: "admin.settings",
      message: "Updated merchant settings.",
    });

    return NextResponse.json({
      settings,
    });
  } catch (error) {
    appendAuditEvent({
      type: "admin.failed",
      message: error instanceof Error ? error.message : "Invalid admin request.",
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid admin request.",
      },
      { status: 400 },
    );
  }
}
