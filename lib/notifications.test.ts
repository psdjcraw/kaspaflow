import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendNotification } from "./notifications";

describe("webhook notifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KASPAFLOW_NOTIFY_WEBHOOK_URL;
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
});
