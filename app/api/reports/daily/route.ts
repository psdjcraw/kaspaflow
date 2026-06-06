import { NextResponse } from "next/server";

import { appendAuditEvent } from "@/lib/audit-store";
import { requireAdminAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notifications";
import { getSalesSummary, listPayments } from "@/lib/payment-store";

export async function GET(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  return NextResponse.json(await buildDailyReport());
}

export async function POST(request: Request) {
  const authError = requireAdminAuth(request);

  if (authError) {
    return authError;
  }

  const report = await buildDailyReport();
  const notification = await sendNotification({
    type: "reports.daily",
    message:
      `Daily sales report: ${report.today.count} real payments, ` +
      `${report.today.fiatAmount} ${report.fiatCurrency}. ` +
      `${report.openPayments.count} open, ${report.refunds.count} refunds.`,
    data: {
      period: report.period,
      fiatCurrency: report.fiatCurrency,
      realCount: report.today.count,
      realFiatAmount: report.today.fiatAmount,
      realKasAmount: report.today.kasAmount,
      simulatedCount: report.simulated.count,
      waitingCount: report.statusCounts.waiting ?? 0,
      underpaidCount: report.statusCounts.underpaid ?? 0,
      overpaidCount: report.statusCounts.overpaid ?? 0,
      expiredCount: report.statusCounts.expired ?? 0,
      openPaymentIds: joinPaymentIds(report.openPayments.items),
      attentionPaymentIds: joinPaymentIds(report.attentionPayments.items),
      refundPaymentIds: joinPaymentIds(report.refunds.items),
    },
  });

  await appendAuditEvent({
    type: "reports.daily",
    message: `Generated daily report for ${report.period}.`,
    metadata: {
      period: report.period,
      sent: notification.sent,
      reason: notification.reason,
      realCount: report.today.count,
      realFiatAmount: report.today.fiatAmount,
      realKasAmount: report.today.kasAmount,
      openCount: report.openPayments.count,
      attentionCount: report.attentionPayments.count,
      refundCount: report.refunds.count,
    },
  });

  return NextResponse.json({
    ...report,
    notification,
  });
}

async function buildDailyReport() {
  const [summary, payments] = await Promise.all([
    getSalesSummary(),
    listPayments(),
  ]);
  const period = new Date().toISOString().slice(0, 10);
  const today = summary.daily.find((entry) => entry.period === period) ?? {
    period,
    fiatAmount: 0,
    kasAmount: 0,
    count: 0,
  };

  return {
    period,
    fiatCurrency: "KRW",
    today,
    totals: summary.totals,
    simulated: summary.simulated ?? {
      fiatAmount: 0,
      kasAmount: 0,
      count: 0,
    },
    openPayments: summarizeReportPayments(
      payments.filter((payment) =>
        !payment.simulated &&
        ["waiting", "seen", "underpaid"].includes(payment.status)
      ),
    ),
    attentionPayments: summarizeReportPayments(
      payments.filter((payment) =>
        !payment.simulated &&
        ["underpaid", "overpaid", "expired"].includes(payment.status)
      ),
    ),
    refunds: summarizeReportPayments(
      payments.filter((payment) =>
        payment.refund ? payment.refund.status !== "none" : false
      ),
    ),
    statusCounts: summary.statusCounts,
    generatedAt: new Date().toISOString(),
  };
}

function summarizeReportPayments(
  payments: Awaited<ReturnType<typeof listPayments>>,
) {
  return {
    count: payments.length,
    items: payments.slice(0, 10).map((payment) => ({
      id: payment.id,
      status: payment.status,
      fiatAmount: payment.fiatAmount,
      fiatCurrency: payment.fiatCurrency,
      kasAmount: payment.kasAmount,
      receivedKasAmount: payment.receivedKasAmount ?? null,
      refundStatus: payment.refund?.status ?? "none",
      createdAt: payment.createdAt,
      expiresAt: payment.expiresAt,
    })),
  };
}

function joinPaymentIds(payments: Array<{ id: string }>) {
  return payments.map((payment) => payment.id).join(",") || null;
}
