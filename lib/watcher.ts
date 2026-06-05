import "server-only";

import type { KaspaPaymentRequest, PaymentStatus } from "./kaspa";
import { getPayment, listPayments, updatePaymentStatus } from "./payment-store";

export type ChainPaymentObservation = {
  status: PaymentStatus;
  txHash?: string;
  receivedKasAmount?: number;
};

export type RefundVerification = {
  status: "confirmed" | "rejected";
  receivedKasAmount?: number;
  note: string;
};

export interface KaspaPaymentWatcher {
  observePayment(paymentId: string): Promise<ChainPaymentObservation | null>;
}

export class MockKaspaPaymentWatcher implements KaspaPaymentWatcher {
  async observePayment(
    paymentId: string,
  ): Promise<ChainPaymentObservation | null> {
    const payment = getPayment(paymentId);

    if (!payment) {
      return null;
    }

    if (Date.now() > new Date(payment.expiresAt).getTime()) {
      return { status: "expired" };
    }

    const ageMs = Date.now() - new Date(payment.createdAt).getTime();

    if (ageMs > 30000) {
      return {
        status: "confirmed",
        txHash: mockTxHash(payment.id),
        receivedKasAmount: payment.kasAmount,
      };
    }

    if (ageMs > 10000) {
      return {
        status: "seen",
        txHash: mockTxHash(payment.id),
        receivedKasAmount: payment.kasAmount,
      };
    }

    return { status: "waiting" };
  }
}

export class KaspaRestPaymentWatcher implements KaspaPaymentWatcher {
  async observePayment(
    paymentId: string,
  ): Promise<ChainPaymentObservation | null> {
    const payment = getPayment(paymentId);

    if (!payment) {
      return null;
    }

    if (Date.now() > new Date(payment.expiresAt).getTime()) {
      return { status: "expired" };
    }

    const transactions = await fetchAddressTransactions(payment.merchantAddress);
    const match = findMatchingTransaction(transactions, payment);

    if (!match) {
      return { status: "waiting" };
    }

    return {
      status: getObservedStatus(match.accepted, match.receivedKasAmount, payment),
      txHash: match.txHash,
      receivedKasAmount: match.receivedKasAmount,
    };
  }
}

export async function syncPaymentFromWatcher(paymentId: string) {
  const observation = await getWatcher().observePayment(paymentId);

  if (!observation) {
    return null;
  }

  return updatePaymentStatus(paymentId, observation.status, {
    txHash: observation.txHash,
    receivedKasAmount: observation.receivedKasAmount,
  });
}

export async function syncOpenPaymentsFromWatcher() {
  const openPayments = listPayments().filter((payment) =>
    ["waiting", "seen", "underpaid"].includes(payment.status)
  );
  const results = [];

  for (const payment of openPayments) {
    const beforeStatus = payment.status;
    const syncedPayment = await syncPaymentFromWatcher(payment.id);

    if (syncedPayment) {
      results.push({
        id: syncedPayment.id,
        beforeStatus,
        afterStatus: syncedPayment.status,
        txHash: syncedPayment.txHash,
        receivedKasAmount: syncedPayment.receivedKasAmount,
      });
    }
  }

  return {
    checked: openPayments.length,
    changed: results.filter((result) =>
      result.beforeStatus !== result.afterStatus
    ).length,
    results,
  };
}

export async function verifyRefundTransaction(
  txHash: string,
  customerAddress: string,
  expectedKasAmount: number,
): Promise<RefundVerification> {
  const transaction = await fetchTransaction(txHash);

  if (!transaction) {
    return {
      status: "rejected",
      note: "환불 TX를 Kaspa REST API에서 찾지 못했습니다.",
    };
  }

  const outputs = collectOutputs(transaction);
  const matchingOutput = outputs.find((output) =>
    output.address === customerAddress &&
    output.kasAmount + getKasTolerance(expectedKasAmount) >= expectedKasAmount
  );

  if (!matchingOutput) {
    return {
      status: "rejected",
      note: "환불 TX에 고객 주소와 요청 금액이 일치하는 출력이 없습니다.",
    };
  }

  if (!isAcceptedTransaction(transaction)) {
    return {
      status: "rejected",
      receivedKasAmount: matchingOutput.kasAmount,
      note: "환불 TX가 아직 accepted 상태가 아닙니다.",
    };
  }

  return {
    status: "confirmed",
    receivedKasAmount: matchingOutput.kasAmount,
    note: "환불 TX가 체인에서 확인됐습니다.",
  };
}

function getWatcher(): KaspaPaymentWatcher {
  if (process.env.KASPA_WATCHER_MODE === "kaspa-rest") {
    return new KaspaRestPaymentWatcher();
  }

  return new MockKaspaPaymentWatcher();
}

async function fetchAddressTransactions(address: string) {
  const baseUrl = process.env.KASPA_REST_API_URL ?? "https://api.kaspa.org";
  const url = new URL(
    `/addresses/${address}/full-transactions`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  url.searchParams.set("limit", "25");
  url.searchParams.set("offset", "0");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: 0,
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.transactions)) {
    return payload.transactions;
  }

  return [];
}

async function fetchTransaction(txHash: string) {
  const baseUrl = process.env.KASPA_REST_API_URL ?? "https://api.kaspa.org";
  const url = new URL(
    `/transactions/${txHash}`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function findMatchingTransaction(
  transactions: unknown[],
  payment: KaspaPaymentRequest,
) {
  for (const transaction of transactions) {
    const outputs = collectOutputs(transaction);

    for (const output of outputs) {
      if (output.address !== payment.merchantAddress) {
        continue;
      }

      if (!isInsidePaymentWindow(transaction, payment)) {
        continue;
      }

      if (output.kasAmount + getKasTolerance(payment.kasAmount) >= payment.kasAmount) {
        return {
          accepted: isAcceptedTransaction(transaction),
          txHash: getTransactionId(transaction),
          receivedKasAmount: output.kasAmount,
        };
      }

      if (output.kasAmount > 0) {
        return {
          accepted: isAcceptedTransaction(transaction),
          txHash: getTransactionId(transaction),
          receivedKasAmount: output.kasAmount,
        };
      }
    }
  }

  return null;
}

function getObservedStatus(
  accepted: boolean,
  receivedKasAmount: number,
  payment: KaspaPaymentRequest,
): PaymentStatus {
  const tolerance = getKasTolerance(payment.kasAmount);

  if (receivedKasAmount + tolerance < payment.kasAmount) {
    return "underpaid";
  }

  if (receivedKasAmount - tolerance > payment.kasAmount) {
    return "overpaid";
  }

  return accepted ? "confirmed" : "seen";
}

function getKasTolerance(kasAmount: number) {
  return Math.max(0.00000001, kasAmount * 0.000001);
}

function isInsidePaymentWindow(
  transaction: unknown,
  payment: KaspaPaymentRequest,
) {
  const transactionTime = getTransactionTime(transaction);

  if (!transactionTime) {
    return true;
  }

  const createdAt = new Date(payment.createdAt).getTime() - 30000;
  const expiresAt = new Date(payment.expiresAt).getTime() + 10 * 60 * 1000;

  return transactionTime >= createdAt && transactionTime <= expiresAt;
}

function collectOutputs(value: unknown): Array<{
  address: string;
  kasAmount: number;
}> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectOutputs);
  }

  const record = value as Record<string, unknown>;
  const address = getString(record, [
    "scriptPublicKeyAddress",
    "script_public_key_address",
    "address",
  ]);
  const amount = getNumber(record, ["amount", "value"]);
  const nested = Object.values(record).flatMap(collectOutputs);

  if (!address || amount === null) {
    return nested;
  }

  return [
    {
      address,
      kasAmount: amount > 1_000_000 ? amount / 100_000_000 : amount,
    },
    ...nested,
  ];
}

function isAcceptedTransaction(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const accepted = record.isAccepted ?? record.accepted;

  return accepted === true;
}

function getTransactionId(value: unknown) {
  if (!value || typeof value !== "object") {
    return "unknown";
  }

  const record = value as Record<string, unknown>;

  return (
    getString(record, ["transactionId", "transaction_id", "hash", "id"]) ??
    "unknown"
  );
}

function getTransactionTime(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const timestamp = getNumber(record, [
    "blockTime",
    "block_time",
    "timestamp",
    "acceptingBlockTime",
    "accepting_block_time",
  ]);

  if (timestamp === null) {
    return null;
  }

  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "string") {
      return record[key];
    }
  }

  return null;
}

function getNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "number") {
      return record[key];
    }

    if (typeof record[key] === "string" && Number.isFinite(Number(record[key]))) {
      return Number(record[key]);
    }
  }

  return null;
}

function mockTxHash(paymentId: string) {
  return `mock_${Buffer.from(paymentId).toString("hex").slice(0, 24)}`;
}
