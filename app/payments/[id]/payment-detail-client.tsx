"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import {
  DEFAULT_MERCHANT_ADDRESS,
  type KaspaPaymentRequest,
} from "@/lib/kaspa";

type PaymentResponse = {
  payment: KaspaPaymentRequest;
  kaspaUri: string;
};

type PaymentDetailClientProps = {
  initialPayment: KaspaPaymentRequest;
  initialKaspaUri: string;
};

const POLL_INTERVAL_MS = 3000;

export function PaymentDetailClient({
  initialPayment,
  initialKaspaUri,
}: PaymentDetailClientProps) {
  const [payment, setPayment] = useState(initialPayment);
  const [kaspaUri, setKaspaUri] = useState(initialKaspaUri);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"address" | "uri" | "">("");
  const [now, setNow] = useState(Date.now());
  const isDefaultAddress =
    payment.merchantAddress.trim().toLowerCase() ===
    DEFAULT_MERCHANT_ADDRESS.toLowerCase();

  useEffect(() => {
    void QRCode.toDataURL(kaspaUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    }).then(setQrDataUrl);
  }, [kaspaUri]);

  useEffect(() => {
    if (!["waiting", "seen", "underpaid"].includes(payment.status)) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshPayment();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [payment.status, payment.id]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  async function refreshPayment() {
    setError("");

    try {
      const response = await fetch(`/api/payments/${payment.id}`, {
        cache: "no-store",
      });
      const payload = await response.json() as PaymentResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "결제 상태를 불러오지 못했습니다.");
      }

      setPayment(payload.payment);
      setKaspaUri(payload.kaspaUri);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  async function copyValue(kind: "address" | "uri", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(""), 1600);
  }

  return (
    <>
      <div className="payment-detail-hero">
        <div className="qr-stage detail-qr-stage">
          {qrDataUrl ? (
            <img alt="Kaspa payment QR code" src={qrDataUrl} />
          ) : (
            <div className="qr-placeholder">QR 준비 중</div>
          )}
        </div>

        <div className="detail-payment-panel">
          <span className={`status status-${payment.status}`}>
            {getStatusLabel(payment.status)}
          </span>
          <h2>{formatFiat(payment.fiatAmount, payment.fiatCurrency)}</h2>
          <p className="muted-copy">{getStatusDescription(payment)}</p>

          {isDefaultAddress ? (
            <p className="warning-text">
              이 결제는 더미 Kaspa 주소를 사용 중입니다. 실제 송금에 쓰지
              마세요.
            </p>
          ) : null}

          {payment.simulated ? (
            <p className="warning-text">
              이 결제는 테스트 시뮬레이션입니다. 실제 매출 합계에서는
              제외됩니다.
            </p>
          ) : null}

          <div className="pay-details">
            <div>
              <span>보낼 KAS</span>
              <strong>{payment.kasAmount.toFixed(8)} KAS</strong>
            </div>
            <div>
              <span>받은 KAS</span>
              <strong>{(payment.receivedKasAmount ?? 0).toFixed(8)} KAS</strong>
            </div>
            <div>
              <span>만료</span>
              <strong>{formatDateTime(payment.expiresAt)}</strong>
            </div>
            <div>
              <span>남은 시간</span>
              <strong>{formatRemaining(payment.expiresAt, now)}</strong>
            </div>
            <div>
              <span>적용 시세</span>
              <strong>{formatFiat(payment.rateFiatPerKas, payment.fiatCurrency)}</strong>
            </div>
          </div>

          <div className="detail-actions">
            <a className="secondary-button" href={kaspaUri}>
              지갑 열기
            </a>
            <button type="button" onClick={() => void refreshPayment()}>
              상태 갱신
            </button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </div>

      <div className="detail-block">
        <div className="section-heading">
          <span>Kaspa 주소</span>
          <button
            type="button"
            onClick={() => void copyValue("address", payment.merchantAddress)}
          >
            {copied === "address" ? "복사됨" : "복사"}
          </button>
        </div>
        <code>{payment.merchantAddress}</code>
      </div>

      <div className="detail-block">
        <div className="section-heading">
          <span>Kaspa URI</span>
          <button type="button" onClick={() => void copyValue("uri", kaspaUri)}>
            {copied === "uri" ? "복사됨" : "복사"}
          </button>
        </div>
        <code>{kaspaUri}</code>
      </div>

      {payment.txHash ? (
        <div className="detail-block">
          <span>TX</span>
          <code>{payment.txHash}</code>
        </div>
      ) : null}
    </>
  );
}

function getStatusLabel(status: KaspaPaymentRequest["status"]) {
  const labels: Record<KaspaPaymentRequest["status"], string> = {
    waiting: "입금 대기",
    seen: "입금 감지",
    confirmed: "확정",
    underpaid: "부족",
    overpaid: "초과",
    expired: "만료",
  };

  return labels[status];
}

function getStatusDescription(payment: KaspaPaymentRequest) {
  if (payment.status === "confirmed" || payment.status === "overpaid") {
    return "Kaspa 체인에서 결제가 확인됐습니다.";
  }

  if (payment.status === "seen") {
    return "입금 거래가 감지됐고 확인을 기다리는 중입니다.";
  }

  if (payment.status === "underpaid") {
    return `${(payment.receivedKasAmount ?? 0).toFixed(8)} KAS만 수신됐습니다.`;
  }

  if (payment.status === "expired") {
    return "이 결제 요청은 만료됐습니다. 새 QR을 생성하세요.";
  }

  return "QR을 스캔하거나 Kaspa 주소로 직접 송금하세요.";
}

function formatFiat(amount: number, currency: KaspaPaymentRequest["fiatCurrency"]) {
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" || currency === "JPY" ? 0 : 2,
  }).format(amount);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRemaining(expiresAt: string, now: number) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - now) / 1000),
  );
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
