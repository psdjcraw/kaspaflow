import "server-only";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  createPaymentRequest,
  isFiatCurrency,
  isKaspaAddress,
  type FiatCurrency,
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
  (globalThis.kaspaflowStore = loadStore());

export type CreatePaymentInput = {
  merchantName: string;
  merchantAddress: string;
  fiatAmount: number;
  fiatCurrency: FiatCurrency;
  rateFiatPerKas: number;
};

export function listPayments() {
  return store.payments.map(hydratePayment).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getPayment(id: string) {
  const payment = store.payments.find((entry) => entry.id === id);

  return payment ? hydratePayment(payment) : null;
}

export function createPayment(input: CreatePaymentInput) {
  validatePaymentInput(input);

  const payment = createPaymentRequest(
    input.fiatAmount,
    input.fiatCurrency,
    input.rateFiatPerKas,
    input.merchantAddress.trim(),
    input.merchantName.trim(),
  );

  store.payments.unshift(payment);
  persistStore();
  return payment;
}

export function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  values: Pick<KaspaPaymentRequest, "txHash" | "receivedKasAmount"> = {},
) {
  const payment = store.payments.find((entry) => entry.id === id);

  if (!payment) {
    return null;
  }

  Object.assign(payment, hydratePayment(payment));
  payment.status = status;
  payment.txHash = values.txHash ?? payment.txHash;
  payment.receivedKasAmount =
    values.receivedKasAmount ?? payment.receivedKasAmount;

  persistStore();
  return hydratePayment(payment);
}

function getStorePath() {
  const dataDir =
    process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data");

  return path.join(dataDir, "payments.json");
}

function loadStore(): StoreState {
  const storePath = getStorePath();

  if (!existsSync(storePath)) {
    return { payments: [] };
  }

  try {
    return JSON.parse(readFileSync(storePath, "utf8")) as StoreState;
  } catch {
    return { payments: [] };
  }
}

function persistStore() {
  const storePath = getStorePath();
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(`${storePath}.tmp`, JSON.stringify(store, null, 2));
  renameSync(`${storePath}.tmp`, storePath);
}

function validatePaymentInput(input: CreatePaymentInput) {
  if (!input.merchantName.trim()) {
    throw new Error("Merchant name is required.");
  }

  if (!isKaspaAddress(input.merchantAddress)) {
    throw new Error("A valid Kaspa address is required.");
  }

  if (!Number.isFinite(input.fiatAmount) || input.fiatAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (!isFiatCurrency(input.fiatCurrency)) {
    throw new Error("Unsupported fiat currency.");
  }

  if (!Number.isFinite(input.rateFiatPerKas) || input.rateFiatPerKas <= 0) {
    throw new Error("Fiat/KAS rate must be greater than zero.");
  }
}

function hydratePayment(payment: KaspaPaymentRequest): KaspaPaymentRequest {
  if (payment.fiatAmount && payment.fiatCurrency && payment.rateFiatPerKas) {
    return payment;
  }

  return {
    ...payment,
    fiatAmount: payment.krwAmount ?? 0,
    fiatCurrency: "KRW",
    rateFiatPerKas: payment.rateKrwPerKas ?? 350,
  };
}
