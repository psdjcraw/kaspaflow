import { NextResponse } from "next/server";

import { listAuditEvents } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  return NextResponse.json({
    events: await listAuditEvents(),
  });
}
