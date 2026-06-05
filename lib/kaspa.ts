export const DEFAULT_MERCHANT_ADDRESS =
  "kaspa:q000000000000000000000000000000000000000000000000000000000000";

export type PaymentStatus =
  | "waiting"
  | "seen"
  | "confirmed"
  | "underpaid"
  | "overpaid"
  | "expired";

export type KaspaPaymentRequest = {
  id: string;
  merchantAddress: string;
  merchantName: string;
  krwAmount: number;
  kasAmount: number;
  rateKrwPerKas: number;
  expiresAt: string;
  createdAt: string;
  status: PaymentStatus;
  txHash?: string;
  receivedKasAmount?: number;
};

export function buildKaspaUri(request: KaspaPaymentRequest) {
  const amount = request.kasAmount.toFixed(8);
  const label = encodeURIComponent(`KaspaFlow ${request.id}`);
  return `${request.merchantAddress}?amount=${amount}&label=${label}`;
}

export function isKaspaAddress(value: string) {
  return /^kaspa:[a-z0-9]{61,63}$/i.test(value.trim());
}

export function krwToKas(krwAmount: number, rateKrwPerKas: number) {
  if (rateKrwPerKas <= 0) {
    throw new Error("KAS/KRW rate must be greater than zero.");
  }

  return Math.ceil((krwAmount / rateKrwPerKas) * 100_000_000) / 100_000_000;
}

export function createPaymentRequest(
  krwAmount: number,
  rateKrwPerKas: number,
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
    krwAmount,
    kasAmount: krwToKas(krwAmount, rateKrwPerKas),
    rateKrwPerKas,
    createdAt,
    expiresAt,
    status: "waiting",
  };
}
