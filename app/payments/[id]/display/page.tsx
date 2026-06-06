import Link from "next/link";
import { notFound } from "next/navigation";

import { buildKaspaUri } from "@/lib/kaspa";
import { getPayment } from "@/lib/payment-store";
import { CustomerDisplayClient } from "./customer-display-client";

type PageContext = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CustomerDisplayPage(context: PageContext) {
  const { id } = await context.params;
  const payment = await getPayment(id);

  if (!payment) {
    notFound();
  }

  return (
    <main className="customer-display-shell">
      <CustomerDisplayClient
        initialPayment={payment}
        initialKaspaUri={buildKaspaUri(payment)}
      />
      <Link className="customer-back-link" href="/">
        직원 화면
      </Link>
    </main>
  );
}
