export const DEFAULT_MERCHANT_ADDRESS =
  "kaspa:q000000000000000000000000000000000000000000000000000000000000";

export const SUPPORTED_FIAT_CURRENCIES = ["KRW", "USD", "EUR", "JPY"] as const;

export type FiatCurrency = (typeof SUPPORTED_FIAT_CURRENCIES)[number];

export type PaymentStatus =
  | "waiting"
  | "seen"
  | "confirmed"
  | "underpaid"
  | "overpaid"
  | "expired";

export type RefundStatus =
  | "none"
  | "requested"
  | "tx-provided"
  | "confirmed"
  | "rejected";

export type RefundRecord = {
  status: RefundStatus;
  customerAddress?: string;
  kasAmount?: number;
  reason?: string;
  requestedAt?: string;
  txHash?: string;
  checkedAt?: string;
  confirmedAt?: string;
  note?: string;
};

export type KaspaPaymentRequest = {
  id: string;
  merchantAddress: string;
  merchantName: string;
  fiatAmount: number;
  fiatCurrency: FiatCurrency;
  rateFiatPerKas: number;
  kasAmount: number;
  expiresAt: string;
  createdAt: string;
  status: PaymentStatus;
  txHash?: string;
  receivedKasAmount?: number;
  krwAmount?: number;
  rateKrwPerKas?: number;
  refund?: RefundRecord;
};

export function buildKaspaUri(request: KaspaPaymentRequest) {
  const amount = request.kasAmount.toFixed(8);
  const label = encodeURIComponent(`KaspaFlow ${request.id}`);
  return `${request.merchantAddress}?amount=${amount}&label=${label}`;
}

export function isKaspaAddress(value: string) {
  return /^kaspa(test)?:[a-z0-9]{61,63}$/i.test(value.trim());
}

export function isFiatCurrency(value: string): value is FiatCurrency {
  return SUPPORTED_FIAT_CURRENCIES.includes(value as FiatCurrency);
}

export function fiatToKas(fiatAmount: number, rateFiatPerKas: number) {
  if (rateFiatPerKas <= 0) {
    throw new Error("Fiat/KAS rate must be greater than zero.");
  }

  return Math.ceil((fiatAmount / rateFiatPerKas) * 100_000_000) / 100_000_000;
}

export function krwToKas(krwAmount: number, rateKrwPerKas: number) {
  return fiatToKas(krwAmount, rateKrwPerKas);
}

export function createPaymentRequest(
  fiatAmount: number,
  fiatCurrency: FiatCurrency,
  rateFiatPerKas: number,
  merchantAddress = DEFAULT_MERCHANT_ADDRESS,
  merchantName = "KaspaFlow Pilot",
): KaspaPaymentRequest {
  const id = `KF-${Date.now().toString(36).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return {
    id,
    merchantAddress,
    merchantName,
    fiatAmount,
    fiatCurrency,
    rateFiatPerKas,
    kasAmount: fiatToKas(fiatAmount, rateFiatPerKas),
    krwAmount: fiatCurrency === "KRW" ? fiatAmount : undefined,
    rateKrwPerKas: fiatCurrency === "KRW" ? rateFiatPerKas : undefined,
    createdAt,
    expiresAt,
    status: "waiting",
  };
}
