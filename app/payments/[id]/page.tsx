import Link from "next/link";
import { notFound } from "next/navigation";

import { buildKaspaUri } from "@/lib/kaspa";
import { getPayment } from "@/lib/payment-store";

type PageContext = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PaymentDetailPage(context: PageContext) {
  const { id } = await context.params;
  const payment = getPayment(id);

  if (!payment) {
    notFound();
  }

  return (
    <main className="app-shell">
      <section className="detail-page">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Payment detail</p>
            <h1>{payment.id}</h1>
          </div>
          <Link className="secondary-button" href="/">
            돌아가기
          </Link>
        </div>

        <div className="detail-grid">
          <DetailItem label="상태" value={payment.status} />
          <DetailItem label="매장" value={payment.merchantName} />
          <DetailItem
            label="기준 금액"
            value={`${payment.fiatAmount} ${payment.fiatCurrency}`}
          />
          <DetailItem label="보낼 KAS" value={`${payment.kasAmount.toFixed(8)} KAS`} />
          <DetailItem
            label="받은 KAS"
            value={`${(payment.receivedKasAmount ?? 0).toFixed(8)} KAS`}
          />
          <DetailItem label="생성" value={formatDateTime(payment.createdAt)} />
          <DetailItem label="만료" value={formatDateTime(payment.expiresAt)} />
          <DetailItem label="TX" value={payment.txHash ?? "-"} />
          <DetailItem label="환불 상태" value={payment.refund?.status ?? "none"} />
          <DetailItem label="환불 TX" value={payment.refund?.txHash ?? "-"} />
        </div>

        <div className="detail-block">
          <span>Kaspa 주소</span>
          <code>{payment.merchantAddress}</code>
        </div>

        <div className="detail-block">
          <span>Kaspa URI</span>
          <code>{buildKaspaUri(payment)}</code>
        </div>
      </section>
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
