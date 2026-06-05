"use client";

import QRCode from "qrcode";
import { FormEvent, useMemo, useState } from "react";
import {
  DEFAULT_MERCHANT_ADDRESS,
  buildKaspaUri,
  createPaymentRequest,
  type KaspaPaymentRequest,
} from "@/lib/kaspa";
import { sampleSales } from "@/lib/sample-data";

const formatKrw = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

export default function Home() {
  const [krwAmount, setKrwAmount] = useState(21000);
  const [rateKrwPerKas, setRateKrwPerKas] = useState(350);
  const [merchantAddress, setMerchantAddress] = useState(
    DEFAULT_MERCHANT_ADDRESS,
  );
  const [request, setRequest] = useState<KaspaPaymentRequest>(() =>
    createPaymentRequest(21000, 350),
  );
  const [qrDataUrl, setQrDataUrl] = useState("");

  const kaspaUri = useMemo(() => buildKaspaUri(request), [request]);

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRequest = createPaymentRequest(
      krwAmount,
      rateKrwPerKas,
      merchantAddress,
    );
    setRequest(nextRequest);
    setQrDataUrl(await QRCode.toDataURL(buildKaspaUri(nextRequest), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    }));
  }

  async function handleShowQr() {
    setQrDataUrl(await QRCode.toDataURL(kaspaUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    }));
  }

  const sales = [request, ...sampleSales];

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="sidebar">
          <div>
            <p className="eyebrow">Kaspa only</p>
            <h1>KaspaFlow</h1>
            <p className="lede">
              카페와 치킨집이 Kaspa를 자기 지갑으로 직접 받는 결제판.
            </p>
          </div>

          <form className="payment-form" onSubmit={handleCreatePayment}>
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
              KAS/KRW 기준가
              <input
                min="1"
                step="0.01"
                type="number"
                value={rateKrwPerKas}
                onChange={(event) =>
                  setRateKrwPerKas(Number(event.target.value))
                }
              />
            </label>

            <label>
              매장 Kaspa 주소
              <input
                value={merchantAddress}
                onChange={(event) => setMerchantAddress(event.target.value)}
              />
            </label>

            <button type="submit">새 결제 만들기</button>
          </form>
        </aside>

        <section className="counter">
          <div className="payment-panel">
            <div className="payment-header">
              <div>
                <p className="eyebrow">주문 {request.id}</p>
                <h2>{formatKrw.format(request.krwAmount)}</h2>
              </div>
              <span className={`status status-${request.status}`}>
                {request.status}
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
                <strong>{request.kasAmount.toFixed(8)} KAS</strong>
              </div>
              <div>
                <span>만료</span>
                <strong>
                  {new Date(request.expiresAt).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
              </div>
            </div>

            <code className="address">{request.merchantAddress}</code>
          </div>

          <div className="sales-panel">
            <div className="section-heading">
              <h2>오늘 결제</h2>
              <button type="button">CSV</button>
            </div>

            <div className="sales-list">
              {sales.map((sale) => (
                <article className="sale-row" key={sale.id}>
                  <div>
                    <strong>{sale.id}</strong>
                    <span>{sale.kasAmount.toFixed(4)} KAS</span>
                  </div>
                  <div>
                    <strong>{formatKrw.format(sale.krwAmount)}</strong>
                    <span className={`status status-${sale.status}`}>
                      {sale.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
