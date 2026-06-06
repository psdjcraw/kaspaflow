import { NextRequest, NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import { isFiatCurrency } from "@/lib/kaspa";
import {
  getMerchantSettings,
  setActiveStore,
  setEmployeeActive,
  updateMerchantSettings,
  upsertEmployee,
  upsertStore,
} from "@/lib/merchant-store";
import {
  getAction,
  getBooleanField,
  getObjectField,
  getStringField,
  readJsonObject,
} from "@/lib/request-validation";

const ADMIN_ACTIONS = [
  "settings",
  "employee",
  "employee-status",
  "store",
  "active-store",
] as const;

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  return NextResponse.json({ settings: await getMerchantSettings() });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonObject(request);
    const action = getAction(body, ADMIN_ACTIONS, "settings");

    if (action === "employee") {
      const settings = await upsertEmployee(getObjectField(body, "employee"));
      await appendAuditEvent({
        type: "admin.employee",
        message: "Updated merchant employee list.",
      });

      return NextResponse.json({
        settings,
      });
    }

    if (action === "employee-status") {
      const employeeId = getStringField(body, "id", {
        required: true,
        maxLength: 64,
      });
      const active = getBooleanField(body, "active", { required: true }) ??
        false;
      const settings = await setEmployeeActive(
        employeeId,
        active,
      );
      await appendAuditEvent({
        type: "admin.employee-status",
        message: "Changed employee active status.",
        metadata: {
          employeeId,
          active,
        },
      });

      return NextResponse.json({
        settings,
      });
    }

    if (action === "store") {
      const settings = await upsertStore(getObjectField(body, "store"));
      await appendAuditEvent({
        type: "admin.store",
        message: "Updated merchant store list.",
      });

      return NextResponse.json({
        settings,
      });
    }

    if (action === "active-store") {
      const storeId = getStringField(body, "id", {
        required: true,
        maxLength: 64,
      });
      const settings = await setActiveStore(storeId);
      await appendAuditEvent({
        type: "admin.active-store",
        message: "Changed active merchant store.",
        metadata: {
          storeId,
        },
      });

      return NextResponse.json({
        settings,
      });
    }

    const defaultCurrency = getStringField(body, "defaultCurrency", {
      required: true,
      maxLength: 3,
    }).toUpperCase();

    if (!isFiatCurrency(defaultCurrency)) {
      throw new Error("Unsupported fiat currency.");
    }

    const settings = await updateMerchantSettings({
      merchantName: getStringField(body, "merchantName", {
        required: true,
        maxLength: 80,
      }),
      merchantAddress: getStringField(body, "merchantAddress", {
        required: true,
        maxLength: 96,
      }),
      defaultCurrency,
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
