"use client";

import QRCode from "qrcode";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MERCHANT_ADDRESS,
  buildKaspaUri,
  type KaspaPaymentRequest,
} from "@/lib/kaspa";

type QuoteResponse = {
  pair: "KAS/KRW";
  rateKrwPerKas: number;
  source: string;
  quotedAt: string;
};

type PaymentResponse = {
  payment: KaspaPaymentRequest;
  kaspaUri: string;
};

const formatKrw = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

export default function Home() {
  const [merchantName, setMerchantName] = useState("KaspaFlow Cafe");
  const [merchantAddress, setMerchantAddress] = useState(
    DEFAULT_MERCHANT_ADDRESS,
  );
  const [krwAmount, setKrwAmount] = useState(21000);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [request, setRequest] = useState<KaspaPaymentRequest | null>(null);
  const [payments, setPayments] = useState<KaspaPaymentRequest[]>([]);
  const [kaspaUri, setKaspaUri] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const estimatedKas = useMemo(() => {
    if (!quote || quote.rateKrwPerKas <= 0) {
      return 0;
    }

    return Math.ceil((krwAmount / quote.rateKrwPerKas) * 100_000_000) /
      100_000_000;
  }, [krwAmount, quote]);

  useEffect(() => {
    void refreshQuote();
    void refreshPayments();
  }, []);

  useEffect(() => {
    if (!request || request.status === "confirmed" || request.status === "expired") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshPayment(request.id);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [request]);

  async function refreshQuote() {
    const response = await fetch("/api/quote");
    setQuote(await response.json());
  }

  async function refreshPayments() {
    const response = await fetch("/api/payments");
    const payload = await response.json();
    setPayments(payload.payments);

    if (!request && payload.payments[0]) {
      const firstPayment = payload.payments[0] as KaspaPaymentRequest;
      const firstKaspaUri = buildKaspaUri(firstPayment);
      setRequest(firstPayment);
      setKaspaUri(firstKaspaUri);
      setQrDataUrl(await createQr(firstKaspaUri));
    }
  }

  async function refreshPayment(id: string) {
    const response = await fetch(`/api/payments/${id}`);

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as PaymentResponse;
    setRequest(payload.payment);
    setKaspaUri(payload.kaspaUri);
    setPayments((current) =>
      [payload.payment, ...current.filter((payment) => payment.id !== id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantName,
          merchantAddress,
          krwAmount,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create payment.");
      }

      const nextPayment = payload.payment as KaspaPaymentRequest;
      const nextKaspaUri = payload.kaspaUri as string;
      setRequest(nextPayment);
      setKaspaUri(nextKaspaUri);
      setQuote(payload.quote);
      setPayments((current) => [
        nextPayment,
        ...current.filter((payment) => payment.id !== nextPayment.id),
      ]);
      setQrDataUrl(await createQr(nextKaspaUri));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleShowQr() {
    if (!kaspaUri) {
      return;
    }

    setQrDataUrl(await createQr(kaspaUri));
  }

  const activePayment = request ?? payments[0] ?? null;

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="sidebar">
          <div>
            <p className="eyebrow">Kaspa only</p>
            <h1>KaspaFlow</h1>
            <p className="lede">
              비수탁 Kaspa QR 결제 요청을 만들고 입금 상태와 매출 기록을
              확인합니다.
            </p>
          </div>

          <form className="payment-form" onSubmit={handleCreatePayment}>
            <label>
              매장명
              <input
                value={merchantName}
                onChange={(event) => setMerchantName(event.target.value)}
              />
            </label>

            <label>
              결제 금액
              <input
                min="100"
                step="100"
                type="number"
                value={krwAmount}
                onChange={(event) => setKrwAmount(Number(event.target.value))}
              />
            </label>

            <label>
              매장 Kaspa 주소
              <input
                value={merchantAddress}
                onChange={(event) => setMerchantAddress(event.target.value)}
              />
            </label>

            <div className="quote-box">
              <span>KAS/KRW</span>
              <strong>
                {quote ? formatKrw.format(quote.rateKrwPerKas) : "loading"}
              </strong>
              <small>
                예상 결제액 {estimatedKas.toFixed(8)} KAS ·{" "}
                {quote?.source ?? "quote"}
              </small>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? "생성 중" : "새 결제 만들기"}
            </button>
          </form>
        </aside>

        <section className="counter">
          <div className="payment-panel">
            {activePayment ? (
              <>
                <div className="payment-header">
                  <div>
                    <p className="eyebrow">주문 {activePayment.id}</p>
                    <h2>{formatKrw.format(activePayment.krwAmount)}</h2>
                  </div>
                  <span className={`status status-${activePayment.status}`}>
                    {activePayment.status}
                  </span>
                </div>

                <div className="qr-stage">
                  {qrDataUrl ? (
                    <img alt="Kaspa payment QR code" src={qrDataUrl} />
                  ) : (
                    <button className="qr-placeholder" onClick={handleShowQr}>
                      QR 표시
                    </button>
                  )}
                </div>

                <div className="pay-details">
                  <div>
                    <span>보낼 KAS</span>
                    <strong>{activePayment.kasAmount.toFixed(8)} KAS</strong>
                  </div>
                  <div>
                    <span>만료</span>
                    <strong>
                      {new Date(activePayment.expiresAt).toLocaleTimeString(
                        "ko-KR",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </strong>
                  </div>
                </div>

                <code className="address">{activePayment.merchantAddress}</code>

                {activePayment.txHash ? (
                  <code className="address">TX {activePayment.txHash}</code>
                ) : null}
              </>
            ) : (
              <div className="empty-state">
                <h2>결제 요청 없음</h2>
                <p>왼쪽에서 첫 Kaspa 결제 요청을 생성하세요.</p>
              </div>
            )}
          </div>

          <div className="sales-panel">
            <div className="section-heading">
              <h2>오늘 결제</h2>
              <a className="secondary-button" href="/api/sales.csv">
                CSV
              </a>
            </div>

            <div className="sales-list">
              {payments.length ? (
                payments.map((sale) => (
                  <article className="sale-row" key={sale.id}>
                    <button type="button" onClick={() => void refreshPayment(sale.id)}>
                      <strong>{sale.id}</strong>
                      <span>{sale.merchantName}</span>
                    </button>
                    <div>
                      <strong>{formatKrw.format(sale.krwAmount)}</strong>
                      <span>{sale.kasAmount.toFixed(4)} KAS</span>
                    </div>
                    <span className={`status status-${sale.status}`}>
                      {sale.status}
                    </span>
                  </article>
                ))
              ) : (
                <p className="muted-copy">아직 결제 요청이 없습니다.</p>
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function createQr(payload: string) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });
}
