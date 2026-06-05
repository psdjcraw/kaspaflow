import type { KaspaPaymentRequest } from "./kaspa";

export const sampleSales: KaspaPaymentRequest[] = [
  {
    id: "KF-PILOT-001",
    merchantAddress: "kaspa:qrpilotmerchantaddress001",
    krwAmount: 4500,
    kasAmount: 12.85714286,
    rateKrwPerKas: 350,
    expiresAt: new Date(Date.now() + 120000).toISOString(),
    status: "confirmed",
  },
  {
    id: "KF-PILOT-002",
    merchantAddress: "kaspa:qrpilotmerchantaddress001",
    krwAmount: 21000,
    kasAmount: 60,
    rateKrwPerKas: 350,
    expiresAt: new Date(Date.now() + 240000).toISOString(),
    status: "waiting",
  },
  {
    id: "KF-PILOT-003",
    merchantAddress: "kaspa:qrpilotmerchantaddress001",
    krwAmount: 17800,
    kasAmount: 50.85714286,
    rateKrwPerKas: 350,
    expiresAt: new Date(Date.now() - 120000).toISOString(),
    status: "expired",
  },
];
