import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(
  process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data"),
);
const dateArg = process.argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
const period = dateArg ?? process.env.KASPAFLOW_RECONCILE_DATE ??
  new Date().toISOString().slice(0, 10);
const paymentsPath = path.join(dataDir, "payments.json");

if (!existsSync(paymentsPath)) {
  console.error(`payments.json not found: ${paymentsPath}`);
  process.exit(1);
}

const state = JSON.parse(readFileSync(paymentsPath, "utf8"));
const payments = Array.isArray(state.payments) ? state.payments : [];
const periodPayments = payments.filter((payment) =>
  String(payment.createdAt ?? "").startsWith(period)
);

const realSales = periodPayments.filter((payment) =>
  isRealSale(payment)
);
const simulatedSales = periodPayments.filter((payment) =>
  isSettled(payment) && isSimulated(payment)
);
const attentionPayments = periodPayments.filter((payment) =>
  !isSimulated(payment) &&
  ["waiting", "seen", "underpaid", "overpaid", "expired"].includes(payment.status)
);
const refunds = periodPayments.filter((payment) =>
  payment.refund && payment.refund.status && payment.refund.status !== "none"
);

const report = {
  ok: attentionPayments.length === 0,
  period,
  dataDir,
  generatedAt: new Date().toISOString(),
  totals: summarizePayments(realSales),
  simulated: summarizePayments(simulatedSales),
  statusCounts: countBy(periodPayments, "status"),
  attention: {
    count: attentionPayments.length,
    ids: attentionPayments.map((payment) => payment.id),
  },
  refunds: {
    count: refunds.length,
    ids: refunds.map((payment) => payment.id),
    byStatus: countRefundsByStatus(refunds),
  },
  realSales: realSales.map(toReconciliationRow),
};

console.log(JSON.stringify(report, null, 2));

function isSettled(payment) {
  return payment.status === "confirmed" || payment.status === "overpaid";
}

function isSimulated(payment) {
  return Boolean(payment.simulated) ||
    String(payment.txHash ?? "").startsWith("simulated-");
}

function isRealSale(payment) {
  return isSettled(payment) && !isSimulated(payment);
}

function summarizePayments(entries) {
  return entries.reduce(
    (summary, payment) => ({
      fiatAmount: summary.fiatAmount + Number(payment.fiatAmount ?? payment.krwAmount ?? 0),
      kasAmount: summary.kasAmount + Number(payment.kasAmount ?? 0),
      receivedKasAmount:
        summary.receivedKasAmount + Number(payment.receivedKasAmount ?? 0),
      count: summary.count + 1,
    }),
    {
      fiatAmount: 0,
      kasAmount: 0,
      receivedKasAmount: 0,
      count: 0,
    },
  );
}

function countBy(entries, field) {
  return entries.reduce((counts, entry) => {
    const key = String(entry[field] ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function countRefundsByStatus(entries) {
  return entries.reduce((counts, entry) => {
    const key = String(entry.refund?.status ?? "none");
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function toReconciliationRow(payment) {
  return {
    id: payment.id,
    merchantName: payment.merchantName,
    merchantAddress: payment.merchantAddress,
    fiatAmount: Number(payment.fiatAmount ?? payment.krwAmount ?? 0),
    fiatCurrency: payment.fiatCurrency ?? "KRW",
    rateFiatPerKas: Number(payment.rateFiatPerKas ?? payment.rateKrwPerKas ?? 0),
    kasAmount: Number(payment.kasAmount ?? 0),
    receivedKasAmount: Number(payment.receivedKasAmount ?? 0),
    status: payment.status,
    txHash: payment.txHash ?? null,
    createdAt: payment.createdAt,
  };
}
