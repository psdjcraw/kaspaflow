import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyRefundTransaction } from "./watcher";

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
});
