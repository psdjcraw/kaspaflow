import {
  SUPPORTED_FIAT_CURRENCIES,
  isFiatCurrency,
  type FiatCurrency,
} from "./kaspa";

export type KaspaQuote = {
  pair: `KAS/${FiatCurrency}`;
  fiatCurrency: FiatCurrency;
  rateFiatPerKas: number;
  rateKrwPerKas?: number;
  source: string;
  quotedAt: string;
};

const DEFAULT_MOCK_RATES: Record<FiatCurrency, number> = {
  KRW: 350,
  USD: 0.25,
  EUR: 0.23,
  JPY: 39,
};

const DEFAULT_PRICE_SOURCE = "coingecko";

export async function getKaspaQuote(
  requestedFiat = process.env.QUOTE_FIAT ?? "KRW",
): Promise<KaspaQuote> {
  const fiatCurrency = normalizeFiatCurrency(requestedFiat);
  const priceSource = process.env.KAS_PRICE_SOURCE ?? DEFAULT_PRICE_SOURCE;

  if (priceSource === "coingecko") {
    const quote = await getCoinGeckoQuote(fiatCurrency);

    if (quote) {
      return quote;
    }
  }

  return getMockQuote(fiatCurrency);
}

function getMockQuote(fiatCurrency: FiatCurrency): KaspaQuote {
  const envKey = `KAS_${fiatCurrency}_RATE`;
  const configuredRate = Number(process.env[envKey]);
  const legacyKrwRate = Number(process.env.KAS_KRW_RATE);
  const rateFiatPerKas =
    Number.isFinite(configuredRate) && configuredRate > 0
      ? configuredRate
      : fiatCurrency === "KRW" &&
          Number.isFinite(legacyKrwRate) &&
          legacyKrwRate > 0
        ? legacyKrwRate
        : DEFAULT_MOCK_RATES[fiatCurrency];

  return {
    pair: `KAS/${fiatCurrency}`,
    fiatCurrency,
    rateFiatPerKas,
    rateKrwPerKas: fiatCurrency === "KRW" ? rateFiatPerKas : undefined,
    source:
      process.env[envKey] || (fiatCurrency === "KRW" && process.env.KAS_KRW_RATE)
        ? "env"
        : "mock",
    quotedAt: new Date().toISOString(),
  };
}

async function getCoinGeckoQuote(
  fiatCurrency: FiatCurrency,
): Promise<KaspaQuote | null> {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", "kaspa");
  url.searchParams.set("vs_currencies", fiatCurrency.toLowerCase());

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const rateFiatPerKas = Number(payload?.kaspa?.[fiatCurrency.toLowerCase()]);

    if (!Number.isFinite(rateFiatPerKas) || rateFiatPerKas <= 0) {
      return null;
    }

    return {
      pair: `KAS/${fiatCurrency}`,
      fiatCurrency,
      rateFiatPerKas,
      rateKrwPerKas: fiatCurrency === "KRW" ? rateFiatPerKas : undefined,
      source: "coingecko",
      quotedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function normalizeFiatCurrency(value: string): FiatCurrency {
  const normalized = value.toUpperCase();

  if (isFiatCurrency(normalized)) {
    return normalized;
  }

  return SUPPORTED_FIAT_CURRENCIES[0];
}
