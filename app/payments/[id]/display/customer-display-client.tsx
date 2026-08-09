"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import type { KaspaPaymentRequest } from "@/lib/kaspa";

type PaymentResponse = {
  payment: KaspaPaymentRequest;
  kaspaUri: string;
};

type CustomerDisplayClientProps = {
  initialPayment: KaspaPaymentRequest;
  initialKaspaUri: string;
};

const POLL_INTERVAL_MS = 3000;

export function CustomerDisplayClient({
  initialPayment,
  initialKaspaUri,
}: CustomerDisplayClientProps) {
  const [payment, setPayment] = useState(initialPayment);
  const [kaspaUri, setKaspaUri] = useState(initialKaspaUri);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState<"address" | "uri" | "">("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void QRCode.toDataURL(kaspaUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 560,
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
    const response = await fetch(`/api/payments/${payment.id}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json() as PaymentResponse;
    setPayment(payload.payment);
    setKaspaUri(payload.kaspaUri);
  }

  async function copyValue(kind: "address" | "uri", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(""), 1600);
  }

  return (
    <section className={`customer-display customer-display-${payment.status}`}>
      <div className="customer-copy">
        <p className="eyebrow">Kaspa direct payment</p>
        <h1>{formatFiat(payment.fiatAmount, payment.fiatCurrency)}</h1>
        <p>{getCustomerMessage(payment)}</p>
        <span className={`status status-${payment.status}`}>
          {getStatusLabel(payment.status)}
        </span>
      </div>

      <div className="customer-qr-card">
        <div className="customer-qr-topline">
          <span>Scan to pay</span>
          <strong>{payment.kasAmount.toFixed(8)} KAS</strong>
        </div>
        {qrDataUrl ? (
          <img alt="Kaspa payment QR code" src={qrDataUrl} />
        ) : (
          <div className="qr-placeholder">QR 준비 중</div>
        )}
        <p>Kaspa 지갑에서 금액과 주소를 확인한 뒤 전송하세요.</p>
      </div>

      <div className="customer-payment-strip">
        <div>
          <span>보낼 KAS</span>
          <strong>{payment.kasAmount.toFixed(8)} KAS</strong>
        </div>
        <div>
          <span>주문 번호</span>
          <strong>{payment.id}</strong>
        </div>
        <div>
          <span>상점</span>
          <strong>{payment.merchantName}</strong>
        </div>
        <div>
          <span>남은 시간</span>
          <strong>{formatRemaining(payment.expiresAt, now)}</strong>
        </div>
      </div>

      <div className="customer-address">
        <span>Kaspa 주소</span>
        <code>{payment.merchantAddress}</code>
        <div className="customer-address-actions">
          <a href={kaspaUri}>지갑 열기</a>
          <button
            type="button"
            onClick={() => void copyValue("address", payment.merchantAddress)}
          >
            {copied === "address" ? "복사됨" : "주소 복사"}
          </button>
          <button type="button" onClick={() => void copyValue("uri", kaspaUri)}>
            {copied === "uri" ? "복사됨" : "URI 복사"}
          </button>
        </div>
      </div>
    </section>
  );
}

function getStatusLabel(status: KaspaPaymentRequest["status"]) {
  const labels: Record<KaspaPaymentRequest["status"], string> = {
    waiting: "결제 대기",
    seen: "입금 감지",
    confirmed: "결제 완료",
    underpaid: "금액 부족",
    overpaid: "초과 입금",
    expired: "만료",
  };

  return labels[status];
}

function getCustomerMessage(payment: KaspaPaymentRequest) {
  if (payment.status === "confirmed" || payment.status === "overpaid") {
    return "결제가 확인됐습니다. 직원 안내를 기다려 주세요.";
  }

  if (payment.status === "seen") {
    return "입금이 감지됐습니다. 체인 확인을 기다리는 중입니다.";
  }

  if (payment.status === "underpaid") {
    return "보낸 금액이 부족합니다. 직원에게 문의해 주세요.";
  }

  if (payment.status === "expired") {
    return "이 QR은 만료됐습니다. 새 결제 QR을 요청해 주세요.";
  }

  return "QR을 스캔하거나 주소를 복사해 Kaspa로 직접 보내 주세요.";
}

function formatFiat(amount: number, currency: KaspaPaymentRequest["fiatCurrency"]) {
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" || currency === "JPY" ? 0 : 2,
  }).format(amount);
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
