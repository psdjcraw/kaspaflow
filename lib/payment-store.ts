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
  (globalThis.kaspaflowStore = loadStore());

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
  persistStore();
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

  persistStore();
  return payment;
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

  if (!Number.isFinite(input.krwAmount) || input.krwAmount < 100) {
    throw new Error("KRW amount must be at least 100.");
  }

  if (!Number.isFinite(input.rateKrwPerKas) || input.rateKrwPerKas <= 0) {
    throw new Error("KAS/KRW rate must be greater than zero.");
  }
}
