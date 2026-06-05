import { listPayments } from "@/lib/payment-store";

export async function GET() {
  const rows = listPayments();
  const header = [
    "id",
    "merchantName",
    "merchantAddress",
    "fiatAmount",
    "fiatCurrency",
    "kasAmount",
    "rateFiatPerKas",
    "status",
    "txHash",
    "receivedKasAmount",
    "createdAt",
    "expiresAt",
  ];
  const csv = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.merchantName,
        row.merchantAddress,
        row.fiatAmount,
        row.fiatCurrency,
        row.kasAmount,
        row.rateFiatPerKas,
        row.status,
        row.txHash ?? "",
        row.receivedKasAmount ?? "",
        row.createdAt,
        row.expiresAt,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Disposition": 'attachment; filename="kaspaflow-sales.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

function csvEscape(value: string | number) {
  const text = String(value);

  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}
