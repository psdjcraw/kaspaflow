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
  type RefundRecord,
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

export function updatePaymentRefund(
  id: string,
  refund: RefundRecord,
) {
  const payment = store.payments.find((entry) => entry.id === id);

  if (!payment) {
    return null;
  }

  Object.assign(payment, hydratePayment(payment));
  payment.refund = {
    ...payment.refund,
    ...refund,
  };

  persistStore();
  return hydratePayment(payment);
}

export function getSalesSummary() {
  const payments = listPayments();
  const confirmedPayments = payments.filter((payment) =>
    payment.status === "confirmed" || payment.status === "overpaid"
  );

  return {
    totals: summarizePayments(confirmedPayments),
    daily: summarizeByPeriod(confirmedPayments, "day"),
    weekly: summarizeByPeriod(confirmedPayments, "week"),
    statusCounts: payments.reduce<Record<string, number>>((counts, payment) => {
      counts[payment.status] = (counts[payment.status] ?? 0) + 1;
      return counts;
    }, {}),
  };
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
  const hydrated = payment.fiatAmount && payment.fiatCurrency && payment.rateFiatPerKas
    ? payment
    : {
        ...payment,
        fiatAmount: payment.krwAmount ?? 0,
        fiatCurrency: "KRW" as const,
        rateFiatPerKas: payment.rateKrwPerKas ?? 350,
      };

  if (hydrated.refund) {
    return hydrated;
  }

  return {
    ...hydrated,
    refund: {
      status: "none",
    },
  };
}

function summarizePayments(payments: KaspaPaymentRequest[]) {
  return payments.reduce(
    (summary, payment) => ({
      fiatAmount: summary.fiatAmount + payment.fiatAmount,
      kasAmount: summary.kasAmount + payment.kasAmount,
      count: summary.count + 1,
    }),
    { fiatAmount: 0, kasAmount: 0, count: 0 },
  );
}

function summarizeByPeriod(
  payments: KaspaPaymentRequest[],
  period: "day" | "week",
) {
  const grouped = new Map<string, KaspaPaymentRequest[]>();

  for (const payment of payments) {
    const key = period === "day"
      ? payment.createdAt.slice(0, 10)
      : getIsoWeekKey(new Date(payment.createdAt));
    grouped.set(key, [...(grouped.get(key) ?? []), payment]);
  }

  return Array.from(grouped.entries())
    .map(([periodKey, entries]) => ({
      period: periodKey,
      ...summarizePayments(entries),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function getIsoWeekKey(date: Date) {
  const normalized = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((normalized.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  return `${normalized.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
