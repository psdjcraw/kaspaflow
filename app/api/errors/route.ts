import { NextResponse } from "next/server";

import { listAuditEvents } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  const events = await listAuditEvents(200);
  const errors = events.filter((event) =>
    event.type.includes("failed") ||
    event.type.includes("rejected") ||
    event.message.toLowerCase().includes("error")
  );

  return NextResponse.json({
    count: errors.length,
    errors: errors.slice(0, 30),
    generatedAt: new Date().toISOString(),
  });
}
