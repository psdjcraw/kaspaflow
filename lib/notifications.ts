import "server-only";

export type NotificationEvent = {
  type: string;
  message: string;
  paymentId?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
};

type WebhookFormat = "json" | "discord" | "telegram";

export async function sendNotification(event: NotificationEvent) {
  const webhookUrl = process.env.KASPAFLOW_NOTIFY_WEBHOOK_URL;

  if (!webhookUrl) {
    return { sent: false, reason: "not-configured" };
  }

  const format = getWebhookFormat();
  const payload = buildWebhookPayload(event, format);

  if (!payload) {
    return { sent: false, reason: "not-configured" };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return {
      sent: response.ok,
      reason: response.ok ? "sent" : `webhook-${response.status}`,
    };
  } catch {
    return { sent: false, reason: "webhook-error" };
  }
}

function getWebhookFormat(): WebhookFormat {
  const value = process.env.KASPAFLOW_NOTIFY_WEBHOOK_FORMAT;

  if (value === "discord" || value === "telegram") {
    return value;
  }

  return "json";
}

function buildWebhookPayload(
  event: NotificationEvent,
  format: WebhookFormat,
) {
  const sentAt = new Date().toISOString();

  if (format === "discord") {
    return {
      content: formatNotificationText(event, sentAt),
      allowed_mentions: {
        parse: [],
      },
    };
  }

  if (format === "telegram") {
    const chatId = process.env.KASPAFLOW_NOTIFY_TELEGRAM_CHAT_ID;

    if (!chatId) {
      return null;
    }

    return {
      chat_id: chatId,
      text: formatNotificationText(event, sentAt),
      disable_web_page_preview: true,
    };
  }

  return {
    ...event,
    service: "kaspaflow",
    sentAt,
  };
}

function formatNotificationText(event: NotificationEvent, sentAt: string) {
  const lines = [
    `[KaspaFlow] ${event.type}`,
    event.message,
    event.paymentId ? `payment: ${event.paymentId}` : null,
    ...Object.entries(event.data ?? {}).map(([key, value]) =>
      `${key}: ${formatDataValue(value)}`
    ),
    `sentAt: ${sentAt}`,
  ];

  return lines.filter(Boolean).join("\n");
}

function formatDataValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}
