export const DEFAULT_MERCHANT_ADDRESS =
  "kaspa:qz7placeholdermerchantaddressreplacebeforeliveuse";

export type KaspaPaymentRequest = {
  id: string;
  merchantAddress: string;
  krwAmount: number;
  kasAmount: number;
  rateKrwPerKas: number;
  expiresAt: string;
  status: "waiting" | "seen" | "confirmed" | "expired";
};

export function buildKaspaUri(request: KaspaPaymentRequest) {
  const amount = request.kasAmount.toFixed(8);
  const label = encodeURIComponent(`KaspaFlow ${request.id}`);
  return `${request.merchantAddress}?amount=${amount}&label=${label}`;
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
): KaspaPaymentRequest {
  const id = `KF-${Date.now().toString(36).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return {
    id,
    merchantAddress,
    krwAmount,
    kasAmount: krwToKas(krwAmount, rateKrwPerKas),
    rateKrwPerKas,
    expiresAt,
    status: "waiting",
  };
}
