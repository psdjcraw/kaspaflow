import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendNotification } from "./notifications";

describe("webhook notifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KASPAFLOW_NOTIFY_WEBHOOK_URL;
    delete process.env.KASPAFLOW_NOTIFY_WEBHOOK_FORMAT;
    delete process.env.KASPAFLOW_NOTIFY_TELEGRAM_CHAT_ID;
  });

  it("skips notification delivery when no webhook is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendNotification({
        type: "payment.created",
        message: "Payment created.",
      }),
    ).resolves.toEqual({ sent: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends JSON webhook notifications when configured", async () => {
    process.env.KASPAFLOW_NOTIFY_WEBHOOK_URL = "https://example.com/webhook";
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendNotification({
        type: "payment.created",
        message: "Payment created.",
        paymentId: "KF-TEST",
      }),
    ).resolves.toEqual({ sent: true, reason: "sent" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("formats Discord webhook notifications", async () => {
    process.env.KASPAFLOW_NOTIFY_WEBHOOK_URL = "https://example.com/discord";
    process.env.KASPAFLOW_NOTIFY_WEBHOOK_FORMAT = "discord";
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await sendNotification({
      type: "reports.daily",
      message: "Daily report.",
      data: {
        openCount: 2,
      },
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      content: expect.stringContaining("[KaspaFlow] reports.daily"),
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("formats Telegram webhook notifications when chat id is configured", async () => {
    process.env.KASPAFLOW_NOTIFY_WEBHOOK_URL = "https://example.com/telegram";
    process.env.KASPAFLOW_NOTIFY_WEBHOOK_FORMAT = "telegram";
    process.env.KASPAFLOW_NOTIFY_TELEGRAM_CHAT_ID = "1234";
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await sendNotification({
      type: "payment.confirmed",
      message: "Payment confirmed.",
      paymentId: "KF-TEST",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      chat_id: "1234",
      text: expect.stringContaining("payment: KF-TEST"),
      disable_web_page_preview: true,
    });
  });

  it("skips Telegram notifications without a chat id", async () => {
    process.env.KASPAFLOW_NOTIFY_WEBHOOK_URL = "https://example.com/telegram";
    process.env.KASPAFLOW_NOTIFY_WEBHOOK_FORMAT = "telegram";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendNotification({
        type: "payment.confirmed",
        message: "Payment confirmed.",
      }),
    ).resolves.toEqual({ sent: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
