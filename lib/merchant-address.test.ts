import { describe, expect, it } from "vitest";

import { DEFAULT_MERCHANT_ADDRESS } from "./kaspa";
import {
  assertOperationalMerchantAddress,
  isDefaultMerchantAddress,
} from "./merchant-address";

describe("merchant address safety", () => {
  it("detects the built-in placeholder address", () => {
    expect(isDefaultMerchantAddress(DEFAULT_MERCHANT_ADDRESS)).toBe(true);
    expect(isDefaultMerchantAddress(DEFAULT_MERCHANT_ADDRESS.toUpperCase()))
      .toBe(true);
  });

  it("allows the placeholder outside production for local smoke checks", () => {
    expect(() =>
      assertOperationalMerchantAddress(DEFAULT_MERCHANT_ADDRESS, "development")
    ).not.toThrow();
  });

  it("rejects the placeholder in production", () => {
    expect(() =>
      assertOperationalMerchantAddress(DEFAULT_MERCHANT_ADDRESS, "production")
    ).toThrow("Replace the default Kaspa address before production use.");
  });
});
