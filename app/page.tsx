"use client";

import QRCode from "qrcode";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MERCHANT_ADDRESS,
  SUPPORTED_FIAT_CURRENCIES,
  buildKaspaUri,
  type FiatCurrency,
  type KaspaPaymentRequest,
} from "@/lib/kaspa";

type QuoteResponse = {
  pair: `KAS/${FiatCurrency}`;
  fiatCurrency: FiatCurrency;
  rateFiatPerKas: number;
  source: string;
  quotedAt: string;
};

type PaymentResponse = {
  payment: KaspaPaymentRequest;
  kaspaUri: string;
};

const QUOTE_REFRESH_INTERVAL_MS = 15_000;

export default function Home() {
  const [merchantName, setMerchantName] = useState("KaspaFlow Cafe");
  const [merchantAddress, setMerchantAddress] = useState(
    DEFAULT_MERCHANT_ADDRESS,
  );
  const [fiatAmount, setFiatAmount] = useState("21000");
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>("KRW");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [request, setRequest] = useState<KaspaPaymentRequest | null>(null);
  const [payments, setPayments] = useState<KaspaPaymentRequest[]>([]);
  const [kaspaUri, setKaspaUri] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const parsedFiatAmount = useMemo(() => parseAmount(fiatAmount), [fiatAmount]);

  const estimatedKas = useMemo(() => {
    if (!quote || quote.rateFiatPerKas <= 0) {
      return 0;
    }

    return Math.ceil((parsedFiatAmount / quote.rateFiatPerKas) * 100_000_000) /
      100_000_000;
  }, [parsedFiatAmount, quote]);

  useEffect(() => {
    void refreshQuote();

    const interval = window.setInterval(() => {
      void refreshQuote();
    }, QUOTE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [fiatCurrency]);

  useEffect(() => {
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
    try {
      setQuote(await fetchJson<QuoteResponse>(`/api/quote?fiat=${fiatCurrency}`));
    } catch {
      setQuote(null);
    }
  }

  async function refreshPayments() {
    const payload = await fetchJson<{ payments: KaspaPaymentRequest[] }>(
      "/api/payments",
    );
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
    try {
      const payload = await fetchJson<PaymentResponse>(`/api/payments/${id}`);
      setRequest(payload.payment);
      setKaspaUri(payload.kaspaUri);
      setPayments((current) =>
        [payload.payment, ...current.filter((payment) => payment.id !== id)]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    } catch {
      return;
    }
  }

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedFiatAmount = normalizeFiatAmount(
      fiatAmount,
      fiatCurrency,
    );

    if (!normalizedFiatAmount) {
      setError(
        fiatCurrency === "KRW" || fiatCurrency === "JPY"
          ? "결제 금액은 1 이상 정수로 입력해 주세요."
          : "결제 금액은 0.01 이상으로 입력해 주세요.",
      );
      return;
    }

    setFiatAmount(formatAmountInput(normalizedFiatAmount, fiatCurrency));
    setIsSubmitting(true);

    try {
      const payload = await fetchJson<PaymentResponse & { quote: QuoteResponse }>(
        "/api/payments",
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantName,
          merchantAddress,
          fiatAmount: normalizedFiatAmount,
          fiatCurrency,
        }),
        },
      );

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

          <form
            className="payment-form"
            noValidate
            onSubmit={handleCreatePayment}
          >
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
                type="text"
                inputMode={
                  fiatCurrency === "KRW" || fiatCurrency === "JPY"
                    ? "numeric"
                    : "decimal"
                }
                value={fiatAmount}
                onChange={(event) => setFiatAmount(event.target.value)}
              />
            </label>

            <label>
              기준 통화
              <select
                value={fiatCurrency}
                onChange={(event) =>
                  setFiatCurrency(event.target.value as FiatCurrency)
                }
              >
                {SUPPORTED_FIAT_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>

            <label>
              매장 Kaspa 주소
              <input
                value={merchantAddress}
                onChange={(event) => setMerchantAddress(event.target.value)}
              />
            </label>

            <div className="quote-box">
              <span>{quote?.pair ?? `KAS/${fiatCurrency}`}</span>
              <strong>
                {quote
                  ? formatFiat(quote.rateFiatPerKas, quote.fiatCurrency)
                  : "loading"}
              </strong>
              <small>
                예상 결제액 {estimatedKas.toFixed(8)} KAS ·{" "}
                {quote
                  ? `${quote.source} · ${formatQuoteTime(quote.quotedAt)}`
                  : "quote"}
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
                    <h2>
                      {formatFiat(
                        activePayment.fiatAmount,
                        activePayment.fiatCurrency,
                      )}
                    </h2>
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
                      <strong>
                        {formatFiat(sale.fiatAmount, sale.fiatCurrency)}
                      </strong>
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

function formatFiat(amount: number, currency: FiatCurrency) {
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" || currency === "JPY" ? 0 : 2,
  }).format(amount);
}

function formatQuoteTime(quotedAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(quotedAt));
}

function parseAmount(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : 0;
}

function normalizeFiatAmount(value: string, currency: FiatCurrency) {
  const amount = parseAmount(value);

  if (currency === "KRW" || currency === "JPY") {
    const rounded = Math.round(amount);
    return rounded > 0 ? rounded : null;
  }

  const rounded = Math.round(amount * 100) / 100;
  return rounded >= 0.01 ? rounded : null;
}

function formatAmountInput(amount: number, currency: FiatCurrency) {
  if (currency === "KRW" || currency === "JPY") {
    return String(Math.round(amount));
  }

  return amount.toFixed(2).replace(/\.?0+$/, "");
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed.");
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("요청 시간이 초과됐습니다. dev server 상태를 확인하세요.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function createQr(payload: string) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });
}
