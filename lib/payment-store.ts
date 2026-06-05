import "server-only";

import {
  createPaymentRequest,
  isKaspaAddress,
  type KaspaPaymentRequest,
  type PaymentStatus,
} from "./kaspa";

type StoreState = {
  payments: KaspaPaymentRequest[];
};

declare global {
  var kaspaflowStore: StoreState | undefined;
}

const store =
  globalThis.kaspaflowStore ??
  (globalThis.kaspaflowStore = {
    payments: [],
  });

export type CreatePaymentInput = {
  merchantName: string;
  merchantAddress: string;
  krwAmount: number;
  rateKrwPerKas: number;
};

export function listPayments() {
  return [...store.payments].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getPayment(id: string) {
  return store.payments.find((payment) => payment.id === id) ?? null;
}

export function createPayment(input: CreatePaymentInput) {
  validatePaymentInput(input);

  const payment = createPaymentRequest(
    input.krwAmount,
    input.rateKrwPerKas,
    input.merchantAddress.trim(),
    input.merchantName.trim(),
  );

  store.payments.unshift(payment);
  return payment;
}

export function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  values: Pick<KaspaPaymentRequest, "txHash" | "receivedKasAmount"> = {},
) {
  const payment = getPayment(id);

  if (!payment) {
    return null;
  }

  payment.status = status;
  payment.txHash = values.txHash ?? payment.txHash;
  payment.receivedKasAmount =
    values.receivedKasAmount ?? payment.receivedKasAmount;

  return payment;
}

function validatePaymentInput(input: CreatePaymentInput) {
  if (!input.merchantName.trim()) {
    throw new Error("Merchant name is required.");
  }

  if (!isKaspaAddress(input.merchantAddress)) {
    throw new Error("A valid Kaspa address is required.");
  }

  if (!Number.isFinite(input.krwAmount) || input.krwAmount < 100) {
    throw new Error("KRW amount must be at least 100.");
  }

  if (!Number.isFinite(input.rateKrwPerKas) || input.rateKrwPerKas <= 0) {
    throw new Error("KAS/KRW rate must be greater than zero.");
  }
}
