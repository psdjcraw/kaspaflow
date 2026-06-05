import { requireAdminAuth } from "@/lib/auth";
import { listAuditEvents } from "@/lib/audit-store";
import { listPayments, getSalesSummary } from "@/lib/payment-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  const encoder = new TextEncoder();
  let ticks = 0;

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const payload = {
          payments: listPayments(),
          analytics: getSalesSummary(),
          auditEvents: listAuditEvents(8),
          sentAt: new Date().toISOString(),
        };
        controller.enqueue(
          encoder.encode(`event: kaspaflow\n` +
            `data: ${JSON.stringify(payload)}\n\n`),
        );
        ticks += 1;

        if (ticks >= 120) {
          clearInterval(interval);
          controller.close();
        }
      };
      const interval = setInterval(send, 3000);
      send();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
