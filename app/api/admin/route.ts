import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import {
  getMerchantSettings,
  setActiveStore,
  setEmployeeActive,
  updateMerchantSettings,
  upsertEmployee,
  upsertStore,
} from "@/lib/merchant-store";

export async function GET() {
  return NextResponse.json({ settings: await getMerchantSettings() });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await request.json();
    const action = String(body.action ?? "settings");

    if (action === "employee") {
      const settings = await upsertEmployee(body.employee ?? {});
      await appendAuditEvent({
        type: "admin.employee",
        message: "Updated merchant employee list.",
      });

      return NextResponse.json({
        settings,
      });
    }

    if (action === "employee-status") {
      const settings = await setEmployeeActive(
        String(body.id ?? ""),
        Boolean(body.active),
      );
      await appendAuditEvent({
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

    if (action === "store") {
      const settings = await upsertStore(body.store ?? {});
      await appendAuditEvent({
        type: "admin.store",
        message: "Updated merchant store list.",
      });

      return NextResponse.json({
        settings,
      });
    }

    if (action === "active-store") {
      const settings = await setActiveStore(String(body.id ?? ""));
      await appendAuditEvent({
        type: "admin.active-store",
        message: "Changed active merchant store.",
        metadata: {
          storeId: String(body.id ?? ""),
        },
      });

      return NextResponse.json({
        settings,
      });
    }

    const settings = await updateMerchantSettings({
      merchantName: body.merchantName,
      merchantAddress: body.merchantAddress,
      defaultCurrency: body.defaultCurrency,
    });
    await appendAuditEvent({
      type: "admin.settings",
      message: "Updated merchant settings.",
    });

    return NextResponse.json({
      settings,
    });
  } catch (error) {
    await appendAuditEvent({
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
