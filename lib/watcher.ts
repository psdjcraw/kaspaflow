import "server-only";

import { getPayment, updatePaymentStatus } from "./payment-store";

export type ChainPaymentObservation = {
  status: "waiting" | "seen" | "confirmed" | "expired";
  txHash?: string;
  receivedKasAmount?: number;
};

export interface KaspaPaymentWatcher {
  observePayment(paymentId: string): ChainPaymentObservation | null;
}

export class MockKaspaPaymentWatcher implements KaspaPaymentWatcher {
  observePayment(paymentId: string): ChainPaymentObservation | null {
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

export function syncPaymentFromWatcher(paymentId: string) {
  const observation = new MockKaspaPaymentWatcher().observePayment(paymentId);

  if (!observation) {
    return null;
  }

  return updatePaymentStatus(paymentId, observation.status, {
    txHash: observation.txHash,
    receivedKasAmount: observation.receivedKasAmount,
  });
}

function mockTxHash(paymentId: string) {
  return `mock_${Buffer.from(paymentId).toString("hex").slice(0, 24)}`;
}
