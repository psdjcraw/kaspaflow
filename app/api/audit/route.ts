import { NextResponse } from "next/server";

import { listAuditEvents } from "@/lib/audit-store";

export async function GET() {
  return NextResponse.json({
    events: await listAuditEvents(),
  });
}
