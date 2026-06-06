import { NextResponse } from "next/server";

import { listAuditEvents } from "@/lib/audit-store";

export async function GET() {
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
