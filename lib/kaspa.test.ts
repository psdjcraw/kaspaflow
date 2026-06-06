import { describe, expect, it } from "vitest";

import {
  DEFAULT_MERCHANT_ADDRESS,
  buildKaspaUri,
  createPaymentRequest,
  fiatToKas,
  isKaspaAddress,
  krwToKas,
} from "./kaspa";

describe("kaspa domain helpers", () => {
  it("validates Kaspa addresses with the REST API length shape", () => {
    expect(isKaspaAddress(DEFAULT_MERCHANT_ADDRESS)).toBe(true);
    expect(
      isKaspaAddress(
        "kaspatest:q000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toBe(true);
    expect(isKaspaAddress("kaspa:q123")).toBe(false);
    expect(
      isKaspaAddress(
        "bitcoin:q000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toBe(false);
  });

  it("converts KRW to KAS with 8 decimal precision", () => {
    expect(krwToKas(21000, 350)).toBe(60);
    expect(fiatToKas(25, 0.25)).toBe(100);
    expect(krwToKas(1000, 333)).toBe(3.00300301);
  });

  it("rejects invalid quote rates", () => {
    expect(() => krwToKas(21000, 0)).toThrow(
      "Fiat/KAS rate must be greater than zero.",
    );
  });

  it("builds a Kaspa URI for wallet QR handoff", () => {
    const payment = createPaymentRequest(21000, "KRW", 350);
    const uri = buildKaspaUri(payment);

    expect(payment.id).toMatch(/^KF-[A-Z0-9]+-[A-Z0-9]{8}$/);
    expect(uri).toContain(DEFAULT_MERCHANT_ADDRESS);
    expect(uri).toContain("amount=60.00000000");
    expect(uri).toContain(`label=KaspaFlow%20${payment.id}`);
  });
});
