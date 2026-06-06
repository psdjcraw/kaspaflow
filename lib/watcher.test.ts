import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.KASPAFLOW_DATA_DIR = `/tmp/kaspaflow-vitest-${process.pid}`;

import {
  KaspaRestPaymentWatcher,
  verifyRefundTransaction,
} from "./watcher";
import { DEFAULT_MERCHANT_ADDRESS } from "./kaspa";
import { createPayment, updatePaymentStatus } from "./payment-store";

describe("Kaspa watcher refund verification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirms accepted refund transactions with matching output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          transactionId: "refund-tx",
          isAccepted: true,
          outputs: [
            {
              scriptPublicKeyAddress:
                "kaspa:q000000000000000000000000000000000000000000000000000000000000",
              amount: 12.5,
            },
          ],
        }),
      ),
    );

    const verification = await verifyRefundTransaction(
      "refund-tx",
      "kaspa:q000000000000000000000000000000000000000000000000000000000000",
      12.5,
    );

    expect(verification.status).toBe("confirmed");
    expect(verification.receivedKasAmount).toBe(12.5);
  });

  it("rejects refund transactions without a matching output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          transactionId: "refund-tx",
          isAccepted: true,
          outputs: [
            {
              scriptPublicKeyAddress:
                "kaspa:q111111111111111111111111111111111111111111111111111111111111",
              amount: 12.5,
            },
          ],
        }),
      ),
    );

    const verification = await verifyRefundTransaction(
      "refund-tx",
      "kaspa:q000000000000000000000000000000000000000000000000000000000000",
      12.5,
    );

    expect(verification.status).toBe("rejected");
  });

  it("does not regress a seen payment to waiting during empty REST reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([])),
    );

    const payment = await createPayment({
      merchantName: "Watcher Test",
      merchantAddress: DEFAULT_MERCHANT_ADDRESS,
      fiatAmount: 1000,
      fiatCurrency: "KRW",
      rateFiatPerKas: 50,
    });
    await updatePaymentStatus(payment.id, "seen", {
      txHash: "seen-tx",
      receivedKasAmount: payment.kasAmount,
    });

    const observation = await new KaspaRestPaymentWatcher().observePayment(
      payment.id,
    );

    expect(observation).toEqual({
      status: "seen",
      txHash: "seen-tx",
      receivedKasAmount: payment.kasAmount,
    });
  });

  it("does not overwrite terminal confirmed payments during watcher reads", async () => {
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    const payment = await createPayment({
      merchantName: "Terminal Watcher Test",
      merchantAddress: DEFAULT_MERCHANT_ADDRESS,
      fiatAmount: 1000,
      fiatCurrency: "KRW",
      rateFiatPerKas: 50,
    });
    await updatePaymentStatus(payment.id, "confirmed", {
      txHash: "confirmed-tx",
      receivedKasAmount: payment.kasAmount,
    });

    const observation = await new KaspaRestPaymentWatcher().observePayment(
      payment.id,
    );

    expect(observation).toEqual({
      status: "confirmed",
      txHash: "confirmed-tx",
      receivedKasAmount: payment.kasAmount,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
