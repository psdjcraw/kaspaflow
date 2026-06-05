import "server-only";

export type NotificationEvent = {
  type: string;
  message: string;
  paymentId?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
};

export async function sendNotification(event: NotificationEvent) {
  const webhookUrl = process.env.KASPAFLOW_NOTIFY_WEBHOOK_URL;

  if (!webhookUrl) {
    return { sent: false, reason: "not-configured" };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...event,
        service: "kaspaflow",
        sentAt: new Date().toISOString(),
      }),
    });

    return {
      sent: response.ok,
      reason: response.ok ? "sent" : `webhook-${response.status}`,
    };
  } catch {
    return { sent: false, reason: "webhook-error" };
  }
}
