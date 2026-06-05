export type KaspaQuote = {
  pair: "KAS/KRW";
  rateKrwPerKas: number;
  source: string;
  quotedAt: string;
};

const DEFAULT_RATE_KRW_PER_KAS = 350;

export function getKaspaQuote(): KaspaQuote {
  const configuredRate = Number(process.env.KAS_KRW_RATE);
  const rateKrwPerKas =
    Number.isFinite(configuredRate) && configuredRate > 0
      ? configuredRate
      : DEFAULT_RATE_KRW_PER_KAS;

  return {
    pair: "KAS/KRW",
    rateKrwPerKas,
    source: process.env.KAS_KRW_RATE ? "env:KAS_KRW_RATE" : "mock",
    quotedAt: new Date().toISOString(),
  };
}
