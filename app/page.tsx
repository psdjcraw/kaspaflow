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

type HealthResponse = {
  ok: boolean;
  kaspaNetwork: string;
  kaspaRestApiUrl: string;
  storageProvider: string;
  watcherMode: string;
  adminAuthEnabled: boolean;
  adminAuthRequired: boolean;
  simulationConfigured: boolean;
  simulationEnabled: boolean;
  simulationBlockedInProduction: boolean;
  checkedAt: string;
};

type MerchantEmployee = {
  id: string;
  name: string;
  role: string;
  active: boolean;
};

type MerchantStore = {
  id: string;
  name: string;
  merchantAddress: string;
  defaultCurrency: FiatCurrency;
  active: boolean;
};

type MerchantSettings = {
  merchantName: string;
  merchantAddress: string;
  defaultCurrency: FiatCurrency;
  activeStoreId: string;
  stores: MerchantStore[];
  employees: MerchantEmployee[];
};

type SalesSummary = {
  totals: {
    fiatAmount: number;
    kasAmount: number;
    count: number;
  };
  simulated?: {
    fiatAmount: number;
    kasAmount: number;
    count: number;
  };
  daily: SalesPeriod[];
  weekly: SalesPeriod[];
  statusCounts: Record<string, number>;
  expiry?: {
    lastRun: string;
    count: number;
  };
};

type SalesPeriod = {
  period: string;
  fiatAmount: number;
  kasAmount: number;
  count: number;
};

type AuditEvent = {
  id: string;
  type: string;
  message: string;
  paymentId?: string;
  createdAt: string;
};

type SyncSummary = {
  checked: number;
  changed: number;
};

type ExpirySummary = {
  changed: number;
  expiredIds: string[];
};

type DailyReportResponse = {
  period: string;
  today: {
    fiatAmount: number;
    kasAmount: number;
    count: number;
  };
  openPayments: {
    count: number;
  };
  attentionPayments: {
    count: number;
  };
  refunds: {
    count: number;
  };
  notification?: {
    sent: boolean;
    reason: string;
  };
};

const QUOTE_REFRESH_INTERVAL_MS = 15_000;
const AUTO_SYNC_INTERVAL_MS = 15_000;

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
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState("cashier");
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState(DEFAULT_MERCHANT_ADDRESS);
  const [analytics, setAnalytics] = useState<SalesSummary | null>(null);
  const [refundAddress, setRefundAddress] = useState("");
  const [refundTxHash, setRefundTxHash] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [expirySummary, setExpirySummary] = useState<ExpirySummary | null>(null);
  const [dailyReport, setDailyReport] = useState<DailyReportResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [now, setNow] = useState(Date.now());

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
    void refreshAdmin();
    void refreshAnalytics();
    void refreshAudit();
    void refreshHealth();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("kaspaflow-admin-token") ?? "";
    setAdminToken(storedToken);
    syncAdminTokenCookie(storedToken);
  }, []);

  useEffect(() => {
    const events = new EventSource("/api/events");

    events.addEventListener("kaspaflow", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        payments: KaspaPaymentRequest[];
        analytics: SalesSummary;
        auditEvents: AuditEvent[];
      };
      setPayments(payload.payments);
      setAnalytics(payload.analytics);
      setAuditEvents(payload.auditEvents);
    });

    return () => events.close();
  }, [adminToken]);

  useEffect(() => {
    if (!request || request.status === "confirmed" || request.status === "expired") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshPayment(request.id);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [request]);

  useEffect(() => {
    if (!autoSyncEnabled) {
      return;
    }

    void syncPayments(true);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncPayments(true);
      }
    }, AUTO_SYNC_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [autoSyncEnabled, adminToken]);

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

  async function refreshAdmin() {
    try {
      const payload = await fetchJson<{ settings: MerchantSettings }>("/api/admin");
      setSettings(payload.settings);
      setMerchantName(payload.settings.merchantName);
      setMerchantAddress(payload.settings.merchantAddress);
      setFiatCurrency(payload.settings.defaultCurrency);
    } catch {
      return;
    }
  }

  async function refreshAnalytics() {
    try {
      const payload = await fetchJson<{ summary: SalesSummary }>("/api/analytics");
      setAnalytics(payload.summary);
    } catch {
      return;
    }
  }

  async function refreshAudit() {
    try {
      const payload = await fetchJson<{ events: AuditEvent[] }>("/api/audit");
      setAuditEvents(payload.events);
    } catch {
      return;
    }
  }

  async function refreshHealth() {
    try {
      setHealth(await fetchJson<HealthResponse>("/api/health"));
    } catch {
      setHealth(null);
    }
  }

  async function refreshPayment(id: string) {
    try {
      const payload = await fetchJson<PaymentResponse>(`/api/payments/${id}`);
      setRequest(payload.payment);
      setKaspaUri(payload.kaspaUri);
      setQrDataUrl(await createQr(payload.kaspaUri));
      setPayments((current) =>
        [payload.payment, ...current.filter((payment) => payment.id !== id)]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      void refreshAnalytics();
      void refreshAudit();
    } catch {
      return;
    }
  }

  async function handleSyncPayments() {
    await syncPayments(false);
  }

  async function syncPayments(silent: boolean) {
    if (!silent) {
      setError("");
    }

    try {
      const payload = await fetchJson<{ summary: SyncSummary }>(
        silent ? "/api/payments/sync?silent=1" : "/api/payments/sync",
        {
          method: "POST",
        },
      );
      setSyncSummary(payload.summary);
      setLastAutoSyncAt(new Date().toISOString());
      await refreshPayments();
      await refreshAnalytics();
      await refreshAudit();
      await refreshHealth();
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : "Unknown error.");
      }
    }
  }

  async function handleExpirePayments() {
    setError("");

    try {
      const payload = await fetchJson<{ summary: ExpirySummary }>(
        "/api/payments/expire",
        {
          method: "POST",
        },
      );
      setExpirySummary(payload.summary);
      await refreshPayments();
      await refreshAnalytics();
      await refreshAudit();
      await refreshHealth();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  async function handleSendDailyReport() {
    setError("");

    try {
      const payload = await fetchJson<DailyReportResponse>("/api/reports/daily", {
        method: "POST",
      });
      setDailyReport(payload);
      await refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
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
      void refreshAnalytics();
      void refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveSettings() {
    setError("");

    try {
      const payload = await fetchJson<{ settings: MerchantSettings }>("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantName,
          merchantAddress,
          defaultCurrency: fiatCurrency,
        }),
      });
      setSettings(payload.settings);
      void refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  function handleAdminTokenChange(value: string) {
    setAdminToken(value);
    syncAdminTokenCookie(value.trim());

    if (value.trim()) {
      window.localStorage.setItem("kaspaflow-admin-token", value.trim());
    } else {
      window.localStorage.removeItem("kaspaflow-admin-token");
    }
  }

  async function handleAddEmployee() {
    setError("");

    try {
      const payload = await fetchJson<{ settings: MerchantSettings }>("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "employee",
          employee: {
            name: employeeName,
            role: employeeRole,
          },
        }),
      });
      setSettings(payload.settings);
      setEmployeeName("");
      setEmployeeRole("cashier");
      void refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  async function handleAddStore() {
    setError("");

    try {
      const payload = await fetchJson<{ settings: MerchantSettings }>("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "store",
          store: {
            name: storeName,
            merchantAddress: storeAddress,
            defaultCurrency: fiatCurrency,
          },
        }),
      });
      setSettings(payload.settings);
      setStoreName("");
      setStoreAddress(payload.settings.merchantAddress);
      void refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  async function handleActiveStore(store: MerchantStore) {
    setError("");

    try {
      const payload = await fetchJson<{ settings: MerchantSettings }>("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "active-store",
          id: store.id,
        }),
      });
      setSettings(payload.settings);
      setMerchantName(payload.settings.merchantName);
      setMerchantAddress(payload.settings.merchantAddress);
      setFiatCurrency(payload.settings.defaultCurrency);
      void refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  async function handleEmployeeStatus(employee: MerchantEmployee) {
    setError("");

    try {
      const payload = await fetchJson<{ settings: MerchantSettings }>("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "employee-status",
          id: employee.id,
          active: !employee.active,
        }),
      });
      setSettings(payload.settings);
      void refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  async function handleRefund() {
    if (!activePayment) {
      return;
    }

    setError("");

    try {
      const payload = await fetchJson<PaymentResponse>(
        `/api/payments/${activePayment.id}/refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerAddress: refundAddress,
            txHash: refundTxHash,
            reason: refundReason,
            kasAmount: activePayment.receivedKasAmount ?? activePayment.kasAmount,
          }),
        },
      );
      setRequest(payload.payment);
      setPayments((current) =>
        [payload.payment, ...current.filter((payment) =>
          payment.id !== payload.payment.id
        )].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      void refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  async function handleSimulatePayment(status: KaspaPaymentRequest["status"]) {
    if (!activePayment) {
      return;
    }

    setError("");

    try {
      const payload = await fetchJson<PaymentResponse>(
        `/api/payments/${activePayment.id}/simulate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            receivedKasAmount: activePayment.kasAmount,
          }),
        },
      );
      setRequest(payload.payment);
      setKaspaUri(payload.kaspaUri);
      setQrDataUrl(await createQr(payload.kaspaUri));
      setPayments((current) =>
        [payload.payment, ...current.filter((payment) =>
          payment.id !== payload.payment.id
        )].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      await refreshAnalytics();
      await refreshAudit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error.");
    }
  }

  async function handleShowQr() {
    if (!kaspaUri) {
      return;
    }

    setQrDataUrl(await createQr(kaspaUri));
  }

  const activePayment = request ?? payments[0] ?? null;
  const activePaymentTiming = activePayment
    ? getPaymentTiming(activePayment, now)
    : null;
  const attentionPayments = useMemo(() => {
    const todayKey = new Date(now).toISOString().slice(0, 10);

    return payments
      .filter((payment) => isAttentionPayment(payment, todayKey))
      .sort(sortAttentionPayments)
      .slice(0, 5);
  }, [payments, now]);
  const readinessChecks = useMemo(() => {
    const checks = [
      {
        label: "REST watcher",
        ok: health?.watcherMode === "kaspa-rest",
        detail: health?.watcherMode ?? "-",
      },
      {
        label: "관리자 보호",
        ok: Boolean(health?.adminAuthEnabled),
        detail: health?.adminAuthEnabled
          ? "켜짐"
          : health?.adminAuthRequired
            ? "필수/꺼짐"
            : "꺼짐",
      },
      {
        label: "시뮬레이션 차단",
        ok: health ? !health.simulationEnabled : false,
        detail: health?.simulationEnabled
          ? "켜짐"
          : health?.simulationBlockedInProduction
            ? "production 차단"
            : "꺼짐",
      },
      {
        label: "체인",
        ok: health?.kaspaNetwork === "mainnet",
        detail: health?.kaspaNetwork ?? "-",
      },
      {
        label: "저장소",
        ok: health?.storageProvider !== "file",
        detail: health?.storageProvider === "file"
          ? "파일럿 모드"
          : health?.storageProvider ?? "-",
      },
    ];

    return {
      checks,
      passed: checks.filter((check) => check.ok).length,
    };
  }, [health]);
  const isUsingDefaultMerchantAddress =
    merchantAddress.trim().toLowerCase() ===
    DEFAULT_MERCHANT_ADDRESS.toLowerCase();

  return (
    <main className="app-shell">
      <header className="console-topbar">
        <div>
          <p className="eyebrow">KaspaFlow POS</p>
          <strong>Kaspa-only direct checkout</strong>
        </div>
        <div className="topbar-status">
          <span className="status status-confirmed">
            {health?.kaspaNetwork ?? "mainnet"}
          </span>
          <span className={`status status-${health?.storageProvider === "postgres" ? "confirmed" : "waiting"}`}>
            {health?.storageProvider ?? "storage"}
          </span>
          <span className={`status status-${health?.watcherMode === "kaspa-rest" ? "confirmed" : "underpaid"}`}>
            {health?.watcherMode ?? "watcher"}
          </span>
        </div>
      </header>

      <section className="pos-grid">
        <aside className="checkout-panel">
          <div>
            <p className="eyebrow">Kaspa only</p>
            <h1>KaspaFlow</h1>
            <p className="lede">
              매장 지갑으로 직접 받는 비수탁 Kaspa 결제 콘솔입니다.
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

            <div className="quick-amounts">
              {[5000, 12000, 21000, 50000].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setFiatAmount(formatAmountInput(amount, fiatCurrency))}
                >
                  {formatFiat(amount, fiatCurrency)}
                </button>
              ))}
            </div>

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
                className="address-input"
                value={merchantAddress}
                onChange={(event) => setMerchantAddress(event.target.value)}
              />
            </label>

            {isUsingDefaultMerchantAddress ? (
              <p className="warning-text">
                현재 더미 Kaspa 주소입니다. 실제 결제 전 상점 지갑 주소로
                교체하세요.
              </p>
            ) : null}

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

          <section className="admin-panel">
            <div className="section-heading">
              <h2>매장 관리자</h2>
              <button type="button" onClick={() => void handleSaveSettings()}>
                저장
              </button>
            </div>

            <div className="admin-grid">
              <label>
                관리자 토큰
                <input
                  autoComplete="off"
                  type="password"
                  value={adminToken}
                  onChange={(event) =>
                    handleAdminTokenChange(event.target.value)
                  }
                />
              </label>
              <label>
                새 매장명
                <input
                  value={storeName}
                  onChange={(event) => setStoreName(event.target.value)}
                />
              </label>
              <label>
                새 매장 Kaspa 주소
                <input
                  className="address-input"
                  value={storeAddress}
                  onChange={(event) => setStoreAddress(event.target.value)}
                />
              </label>
              <button type="button" onClick={() => void handleAddStore()}>
                매장 추가
              </button>
              <label>
                직원 이름
                <input
                  value={employeeName}
                  onChange={(event) => setEmployeeName(event.target.value)}
                />
              </label>
              <label>
                역할
                <select
                  value={employeeRole}
                  onChange={(event) => setEmployeeRole(event.target.value)}
                >
                  <option value="cashier">cashier</option>
                  <option value="manager">manager</option>
                  <option value="owner">owner</option>
                </select>
              </label>
              <button type="button" onClick={() => void handleAddEmployee()}>
                직원 추가
              </button>
            </div>

            <div className="employee-list">
              {(settings?.stores ?? []).map((store) => (
                <article className="employee-row" key={store.id}>
                  <div>
                    <strong>{store.name}</strong>
                    <span>{store.defaultCurrency} · {store.merchantAddress}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleActiveStore(store)}
                  >
                    {settings?.activeStoreId === store.id ? "선택됨" : "선택"}
                  </button>
                </article>
              ))}
            </div>

            <div className="employee-list">
              {(settings?.employees ?? []).map((employee) => (
                <article className="employee-row" key={employee.id}>
                  <div>
                    <strong>{employee.name}</strong>
                    <span>{employee.role}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleEmployeeStatus(employee)}
                  >
                    {employee.active ? "활성" : "비활성"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <section className="commerce-stage">
          <div className="payment-panel qr-workbench">
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
                  <div className="button-group">
                    <a
                      className="secondary-button"
                      href={`/payments/${activePayment.id}/display`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      고객 화면
                    </a>
                    <span className={`status status-${activePayment.status}`}>
                      {getStatusLabel(activePayment.status)}
                    </span>
                  </div>
                </div>

                <div className="status-card">
                  <div>
                    <strong>{getStatusHeadline(activePayment.status)}</strong>
                    <span>{getStatusDescription(activePayment)}</span>
                  </div>
                  <span>{activePaymentTiming?.remainingLabel}</span>
                </div>

                {activePayment.simulated ? (
                  <p className="warning-text">
                    이 결제는 테스트 시뮬레이션입니다. 실제 매출 합계에서는
                    제외됩니다.
                  </p>
                ) : null}

                <div className="expiry-meter">
                  <i style={{ width: `${activePaymentTiming?.progress ?? 0}%` }} />
                </div>

                {health?.simulationEnabled ? (
                  <div className="simulation-box">
                    <div>
                      <strong>테스트 시뮬레이션</strong>
                      <span>실제 송금 없이 현재 결제 상태를 바꿉니다.</span>
                    </div>
                    <div className="button-group">
                      <button
                        type="button"
                        onClick={() => void handleSimulatePayment("seen")}
                      >
                        입금 감지
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSimulatePayment("confirmed")}
                      >
                        결제 확정
                      </button>
                    </div>
                  </div>
                ) : null}

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
                      {activePaymentTiming?.expiresAtLabel}
                    </strong>
                  </div>
                  <div>
                    <span>받은 KAS</span>
                    <strong>
                      {(activePayment.receivedKasAmount ?? 0).toFixed(8)} KAS
                    </strong>
                  </div>
                  <div>
                    <span>적용 시세</span>
                    <strong>
                      {formatFiat(
                        activePayment.rateFiatPerKas,
                        activePayment.fiatCurrency,
                      )}
                    </strong>
                  </div>
                </div>

                <code className="address">{activePayment.merchantAddress}</code>

                {activePayment.txHash ? (
                  <code className="address">TX {activePayment.txHash}</code>
                ) : null}

                <div className="refund-box">
                  <div className="section-heading">
                    <h3>환불 확인</h3>
                    <span className={`status status-${activePayment.refund?.status ?? "none"}`}>
                      {activePayment.refund?.status ?? "none"}
                    </span>
                  </div>
                  <div className="refund-grid">
                    <input
                      placeholder="고객 Kaspa 주소"
                      value={refundAddress}
                      onChange={(event) => setRefundAddress(event.target.value)}
                    />
                    <input
                      placeholder="환불 TX 해시"
                      value={refundTxHash}
                      onChange={(event) => setRefundTxHash(event.target.value)}
                    />
                    <input
                      placeholder="환불 사유"
                      value={refundReason}
                      onChange={(event) => setRefundReason(event.target.value)}
                    />
                    <button type="button" onClick={() => void handleRefund()}>
                      환불 기록/검증
                    </button>
                  </div>
                  {activePayment.refund?.note ? (
                    <p className="muted-copy">{activePayment.refund.note}</p>
                  ) : null}
                </div>
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
              <h2>매출 대시보드</h2>
              <button type="button" onClick={() => void refreshAnalytics()}>
                새로고침
              </button>
            </div>

            <div className="metric-grid">
              <div>
                <span>확정 결제</span>
                <strong>{analytics?.totals.count ?? 0}</strong>
              </div>
              <div>
                <span>원화 매출</span>
                <strong>{formatFiat(analytics?.totals.fiatAmount ?? 0, "KRW")}</strong>
              </div>
              <div>
                <span>KAS 수령</span>
                <strong>{(analytics?.totals.kasAmount ?? 0).toFixed(4)} KAS</strong>
              </div>
              <div>
                <span>시뮬레이션</span>
                <strong>{analytics?.simulated?.count ?? 0}</strong>
              </div>
            </div>

            <div className="chart-grid">
              <SalesChart title="일별 매출" rows={analytics?.daily ?? []} />
              <SalesChart title="주별 매출" rows={analytics?.weekly ?? []} />
            </div>
          </div>

          <div className="sales-panel">
            <div className="section-heading">
              <h2>운영 동기화</h2>
              <div className="button-group">
                <button type="button" onClick={() => void refreshHealth()}>
                  상태 확인
                </button>
                <button type="button" onClick={() => void handleExpirePayments()}>
                  만료 정리
                </button>
                <button type="button" onClick={() => void handleSyncPayments()}>
                  전체 동기화
                </button>
                <button type="button" onClick={() => void handleSendDailyReport()}>
                  일일 리포트
                </button>
              </div>
            </div>

            <div className="ops-health-grid">
              <div>
                <span>체인</span>
                <strong>{health?.kaspaNetwork ?? "-"}</strong>
              </div>
              <div>
                <span>Watcher</span>
                <strong>{health?.watcherMode ?? "-"}</strong>
              </div>
              <div>
                <span>저장소</span>
                <strong>{health?.storageProvider ?? "-"}</strong>
              </div>
              <div>
                <span>관리자 보호</span>
                <strong>
                  {health?.adminAuthEnabled
                    ? "켜짐"
                    : health?.adminAuthRequired
                      ? "필수/꺼짐"
                      : "꺼짐"}
                </strong>
              </div>
              <div>
                <span>시뮬레이션</span>
                <strong>
                  {health?.simulationEnabled
                    ? "켜짐"
                    : health?.simulationBlockedInProduction
                      ? "production 차단"
                      : "꺼짐"}
                </strong>
              </div>
              <div>
                <span>REST API</span>
                <strong>{health?.kaspaRestApiUrl ?? "-"}</strong>
              </div>
            </div>

            <div className="readiness-panel">
              <div>
                <span>운영 준비도</span>
                <strong>
                  {readinessChecks.passed}/{readinessChecks.checks.length}
                </strong>
              </div>
              <ul>
                {readinessChecks.checks.map((check) => (
                  <li key={check.label}>
                    <span className={`readiness-dot ${check.ok ? "ok" : "warn"}`} />
                    <strong>{check.label}</strong>
                    <em>{check.detail}</em>
                  </li>
                ))}
              </ul>
            </div>

            {health && health.watcherMode !== "kaspa-rest" ? (
              <p className="warning-text">
                실제 입금 감시가 꺼져 있습니다. 운영 전 watcher를 kaspa-rest로
                전환하세요.
              </p>
            ) : null}

            {health && !health.adminAuthEnabled ? (
              <p className="warning-text">
                관리자 토큰 보호가 꺼져 있습니다.
                {health.adminAuthRequired ? " production에서는 관리자 API가 차단됩니다." : ""}
                외부에 노출하기 전 KASPAFLOW_ADMIN_TOKEN을 설정하세요.
              </p>
            ) : null}

            {health && health.storageProvider === "file" ? (
              <p className="warning-text">
                파일 저장소 모드입니다. 파일럿 종료 후 베타 전환 전에는
                docs/database-migration.md 기준으로 DB 이전을 진행하세요.
              </p>
            ) : null}

            <div className="auto-sync-row">
              <label>
                <input
                  checked={autoSyncEnabled}
                  type="checkbox"
                  onChange={(event) => setAutoSyncEnabled(event.target.checked)}
                />
                자동 백그라운드 동기화
              </label>
              <span>
                {lastAutoSyncAt
                  ? `최근 ${formatQuoteTime(lastAutoSyncAt)}`
                  : "대기 중"}
              </span>
            </div>

            <div className="sync-strip">
              <div>
                <span>확인한 결제</span>
                <strong>{syncSummary?.checked ?? 0}</strong>
              </div>
              <div>
                <span>상태 변경</span>
                <strong>{syncSummary?.changed ?? 0}</strong>
              </div>
              <div>
                <span>대기</span>
                <strong>{analytics?.statusCounts.waiting ?? 0}</strong>
              </div>
              <div>
                <span>확정</span>
                <strong>{analytics?.statusCounts.confirmed ?? 0}</strong>
              </div>
              <div>
                <span>만료 정리</span>
                <strong>{expirySummary?.changed ?? analytics?.expiry?.count ?? 0}</strong>
              </div>
            </div>

            {dailyReport ? (
              <p className="muted-copy">
                {dailyReport.period} 리포트: {dailyReport.today.count}건,
                {" "}
                {formatFiat(dailyReport.today.fiatAmount, "KRW")} / 열린 결제
                {" "}
                {dailyReport.openPayments.count}건 / 확인 필요
                {" "}
                {dailyReport.attentionPayments.count}건 / 환불
                {" "}
                {dailyReport.refunds.count}건 / 알림
                {" "}
                {dailyReport.notification?.reason ?? "generated"}
              </p>
            ) : null}

            <div className="attention-queue">
              <div className="section-heading compact-heading">
                <h3>확인 필요 결제</h3>
                <strong>{attentionPayments.length}</strong>
              </div>
              {attentionPayments.length ? (
                <div className="attention-list">
                  {attentionPayments.map((payment) => (
                    <article className="attention-row" key={payment.id}>
                      <button
                        type="button"
                        onClick={() => void refreshPayment(payment.id)}
                      >
                        <strong>{payment.id}</strong>
                        <span>{getAttentionReason(payment)}</span>
                      </button>
                      <div>
                        <strong>
                          {formatFiat(payment.fiatAmount, payment.fiatCurrency)}
                        </strong>
                        <span>{payment.kasAmount.toFixed(4)} KAS</span>
                      </div>
                      <span className={`status status-${payment.status}`}>
                        {getStatusLabel(payment.status)}
                      </span>
                      <a className="detail-link" href={`/payments/${payment.id}/display`}>
                        고객
                      </a>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">현재 확인이 필요한 결제가 없습니다.</p>
              )}
            </div>

            <div className="audit-list">
              {auditEvents.length ? (
                auditEvents.slice(0, 8).map((event) => (
                  <article className="audit-row" key={event.id}>
                    <div>
                      <strong>{event.type}</strong>
                      <span>{event.message}</span>
                    </div>
                    <time>{formatQuoteTime(event.createdAt)}</time>
                  </article>
                ))
              ) : (
                <p className="muted-copy">아직 운영 로그가 없습니다.</p>
              )}
            </div>
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
                    <a className="detail-link" href={`/payments/${sale.id}`}>
                      상세
                    </a>
                    <a className="detail-link" href={`/payments/${sale.id}/display`}>
                      고객
                    </a>
                    <div>
                      <strong>
                        {formatFiat(sale.fiatAmount, sale.fiatCurrency)}
                      </strong>
                      <span>{sale.kasAmount.toFixed(4)} KAS</span>
                    </div>
                    <span className={`status status-${sale.status}`}>
                      {sale.simulated ? "sim" : sale.status}
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

function SalesChart({ title, rows }: { title: string; rows: SalesPeriod[] }) {
  const maxAmount = Math.max(...rows.map((row) => row.fiatAmount), 1);

  return (
    <section className="chart-panel">
      <h3>{title}</h3>
      <div className="bar-list">
        {rows.length ? (
          rows.slice(-7).map((row) => (
            <div className="bar-row" key={row.period}>
              <span>{row.period}</span>
              <div>
                <i style={{ width: `${Math.max(8, (row.fiatAmount / maxAmount) * 100)}%` }} />
              </div>
              <strong>{formatFiat(row.fiatAmount, "KRW")}</strong>
            </div>
          ))
        ) : (
          <p className="muted-copy">확정된 매출이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

function getPaymentTiming(payment: KaspaPaymentRequest, now: number) {
  const createdAt = new Date(payment.createdAt).getTime();
  const expiresAt = new Date(payment.expiresAt).getTime();
  const totalMs = Math.max(1, expiresAt - createdAt);
  const remainingMs = Math.max(0, expiresAt - now);
  const elapsedMs = Math.min(totalMs, Math.max(0, now - createdAt));

  return {
    expiresAtLabel: new Date(payment.expiresAt).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    progress: payment.status === "expired"
      ? 100
      : Math.round((elapsedMs / totalMs) * 100),
    remainingLabel: payment.status === "expired"
      ? "만료됨"
      : `${formatDuration(remainingMs)} 남음`,
  };
}

function getStatusLabel(status: KaspaPaymentRequest["status"]) {
  const labels: Record<KaspaPaymentRequest["status"], string> = {
    waiting: "대기",
    seen: "입금 감지",
    confirmed: "확정",
    underpaid: "부족",
    overpaid: "초과",
    expired: "만료",
  };

  return labels[status];
}

function getStatusHeadline(status: KaspaPaymentRequest["status"]) {
  const headlines: Record<KaspaPaymentRequest["status"], string> = {
    waiting: "입금 대기 중",
    seen: "체인에서 입금을 감지했습니다",
    confirmed: "결제가 확정됐습니다",
    underpaid: "입금액이 부족합니다",
    overpaid: "입금액이 초과됐습니다",
    expired: "결제 시간이 만료됐습니다",
  };

  return headlines[status];
}

function getStatusDescription(payment: KaspaPaymentRequest) {
  if (payment.receivedKasAmount) {
    return `${payment.receivedKasAmount.toFixed(8)} KAS 수신`;
  }

  if (payment.status === "expired") {
    return "새 결제 요청을 생성해야 합니다.";
  }

  return "QR 또는 Kaspa URI로 직접 입금을 기다립니다.";
}

function isAttentionPayment(payment: KaspaPaymentRequest, todayKey: string) {
  if (payment.simulated) {
    return false;
  }

  if (["waiting", "seen", "underpaid", "overpaid"].includes(payment.status)) {
    return true;
  }

  if (payment.status === "expired" && payment.createdAt.startsWith(todayKey)) {
    return true;
  }

  return Boolean(
    payment.refund?.status &&
      payment.refund.status !== "none" &&
      payment.refund.status !== "confirmed",
  );
}

function sortAttentionPayments(
  first: KaspaPaymentRequest,
  second: KaspaPaymentRequest,
) {
  const priorityDiff = getAttentionPriority(second) - getAttentionPriority(first);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return second.createdAt.localeCompare(first.createdAt);
}

function getAttentionPriority(payment: KaspaPaymentRequest) {
  if (
    payment.refund?.status &&
    payment.refund.status !== "none" &&
    payment.refund.status !== "confirmed"
  ) {
    return 5;
  }

  if (payment.status === "underpaid" || payment.status === "overpaid") {
    return 4;
  }

  if (payment.status === "seen") {
    return 3;
  }

  if (payment.status === "waiting") {
    return 2;
  }

  if (payment.status === "expired") {
    return 1;
  }

  return 0;
}

function getAttentionReason(payment: KaspaPaymentRequest) {
  if (payment.refund?.status && payment.refund.status !== "none") {
    return `환불 ${payment.refund.status}`;
  }

  if (payment.status === "waiting") {
    return "입금 대기";
  }

  if (payment.status === "seen") {
    return "체인 확인 대기";
  }

  if (payment.status === "underpaid") {
    return "부족 입금 처리 필요";
  }

  if (payment.status === "overpaid") {
    return "초과 입금 확인 필요";
  }

  if (payment.status === "expired") {
    return "만료 결제 정리 필요";
  }

  return "상태 확인 필요";
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  const headers = new Headers(init?.headers);
  const adminToken = window.localStorage.getItem("kaspaflow-admin-token");

  if (adminToken) {
    headers.set("x-kaspaflow-admin-token", adminToken);
  }

  try {
    const response = await fetch(input, {
      ...init,
      headers,
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

function syncAdminTokenCookie(value: string) {
  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";

  if (value) {
    document.cookie = `kaspaflow-admin-token=${encodeURIComponent(value)}; Path=/; SameSite=Lax${secureFlag}`;
  } else {
    document.cookie = `kaspaflow-admin-token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`;
  }
}

function createQr(payload: string) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });
}
