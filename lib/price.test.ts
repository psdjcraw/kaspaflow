import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getKaspaQuote } from "./price";

describe("Kaspa quote pricing", () => {
  beforeEach(() => {
    delete process.env.KAS_PRICE_SOURCE;
    delete process.env.KAS_KRW_RATE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KAS_PRICE_SOURCE;
    delete process.env.KAS_KRW_RATE;
  });

  it("uses Coinone first for KAS/KRW in auto mode", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        result: "success",
        tickers: [{ last: "44.14" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const quote = await getKaspaQuote("KRW");

    expect(quote.source).toBe("coinone");
    expect(quote.rateFiatPerKas).toBe(44.14);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back to CoinGecko when Coinone is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ kaspa: { krw: 45.34 } }));
    vi.stubGlobal("fetch", fetchMock);

    const quote = await getKaspaQuote("KRW");

    expect(quote.source).toBe("coingecko");
    expect(quote.rateFiatPerKas).toBe(45.34);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps explicit mock pricing available for local simulations", async () => {
    process.env.KAS_PRICE_SOURCE = "mock";
    process.env.KAS_KRW_RATE = "123";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const quote = await getKaspaQuote("KRW");

    expect(quote.source).toBe("env");
    expect(quote.rateFiatPerKas).toBe(123);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
