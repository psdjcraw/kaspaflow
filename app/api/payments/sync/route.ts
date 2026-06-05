import { NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { syncOpenPaymentsFromWatcher } from "@/lib/watcher";

export async function POST() {
  const summary = await syncOpenPaymentsFromWatcher();

  appendAuditEvent({
    type: "payments.sync",
    message: `Synced ${summary.checked} open payments, ${summary.changed} changed.`,
    metadata: {
      checked: summary.checked,
      changed: summary.changed,
    },
  });

  return NextResponse.json({ summary });
}
