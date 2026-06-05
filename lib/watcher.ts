import "server-only";

import type { KaspaPaymentRequest } from "./kaspa";
import { getPayment, updatePaymentStatus } from "./payment-store";

export type ChainPaymentObservation = {
  status: "waiting" | "seen" | "confirmed" | "expired";
  txHash?: string;
  receivedKasAmount?: number;
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
      status: match.accepted ? "confirmed" : "seen",
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

      if (Math.abs(output.kasAmount - payment.kasAmount) < 0.00000001) {
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
