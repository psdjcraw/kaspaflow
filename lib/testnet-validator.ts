/**
 * testnet-validator.ts
 *
 * Kaspa testnet 검증 유틸리티. 실제 테스트넷에서 전송→수신 확인,
 * 주소 생성/검증, 잔액 확인 등을 지원한다.
 */

import "server-only";

import { DEFAULT_MERCHANT_ADDRESS, isKaspaAddress } from "./kaspa";
import {
  buildKaspaRestUrl,
  getKaspaNetwork,
  getKaspaRestApiUrl,
} from "./kaspa-network";

// ============================================================
// Types
// ============================================================

export interface TestnetTransferResult {
  ok: boolean;
  txId?: string;
  error?: string;
}

export interface TestnetBalanceResult {
  confirmed: number;
  unconfirmed: number;
}

export interface AddressInfo {
  address: string;
  isValid: boolean;
  isTestnet: boolean;
  network: string;
}

// ============================================================
// 주소 검증
// ============================================================

export function validateAddress(address: string): AddressInfo {
  const normalized = address.trim().toLowerCase();
  const isTestnetKaspa = normalized.startsWith("kaspatest:");
  const network = getKaspaNetwork();

  return {
    address: normalized,
    isValid: isKaspaAddress(normalized),
    isTestnet: isTestnetKaspa || network === "testnet-10",
    network,
  };
}

// ============================================================
// 잔액 조회 (address → scriptPublicKeyAddress)
// ============================================================

export async function fetchBalance(address: string): Promise<TestnetBalanceResult> {
  const info = validateAddress(address);
  
  if (!info.isValid) {
    return { confirmed: 0, unconfirmed: 0 };
  }

  const url = buildKaspaRestUrl(`/addresses/${address}/balance`);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { confirmed: 0, unconfirmed: 0 };
    }

    const payload = await response.json();
    
    // REST API 응답 구조 대응
    const confirmed = getNumber(payload, [
      "confirmedBalance",
      "confirmed_balance",
      "balance",
      "balance.confirmed",
    ]);
    const unconfirmed = getNumber(payload, [
      "unconfirmedBalance", 
      "unconfirmed_balance", 
      "pendingBalance",
      "pending_balance",
    ]);

    return {
      confirmed: confirmed ?? 0,
      unconfirmed: unconfirmed ?? 0,
    };
  } catch {
    return { confirmed: 0, unconfirmed: 0 };
  }
}

// ============================================================
// 트랜잭션 조회 상세
// ============================================================

export interface TransactionDetail {
  txId: string;
  blockHash?: string;
  isAccepted: boolean;
  timestamp?: number;
  outputs: Array<{ address: string; kasAmount: number }>;
}

export async function fetchTransactionDetail(txId: string): Promise<TransactionDetail | null> {
  const url = buildKaspaRestUrl(`/transactions/${txId}`);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return parseTransactionDetail(payload);
  } catch {
    return null;
  }
}

// ============================================================
// 주소 트랜잭션 목록 (최신)
// ============================================================

export async function fetchAddressTransactions(address: string, limit = 25): Promise<TransactionDetail[]> {
  const url = buildKaspaRestUrl(`/addresses/${address}/full-transactions`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", "0");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    const rawList = Array.isArray(payload) ? payload : (payload.transactions ?? []);

    return rawList
      .map((tx: unknown) => parseTransactionDetail(tx))
      .filter(Boolean) as TransactionDetail[];
  } catch {
    return [];
  }
}

// ============================================================
// 헬스체크 + 네트워크 확인
// ============================================================

export async function testnetHealthCheck(): Promise<{
  network: string;
  apiUrl: string;
  healthOk: boolean;
  blockDagOk: boolean;
  peers?: number;
}> {
  const baseUrl = getKaspaRestApiUrl();
  const network = getKaspaNetwork();

  // health endpoint
  let healthOk = false;
  try {
    const healthResp = await fetch(buildKaspaRestUrl("/info/health"), {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (healthResp.ok) {
      const payload = await healthResp.json();
      healthOk = Boolean(payload.database?.isSynced ?? payload.isHealthy ?? false);
    }
  } catch {
    healthOk = false;
  }

  // blockdag endpoint
  let blockDagOk = false;
  let peers: number | undefined;
  try {
    const dagResp = await fetch(buildKaspaRestUrl("/info/blockdag"), {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (dagResp.ok) {
      const payload = await dagResp.json();
      blockDagOk = !!payload.blockCount;
      peers = getNumber(payload, ["peerCount", "peer_count", "peers"]) ?? undefined;
    }
  } catch {
    blockDagOk = false;
  }

  return { network, apiUrl: baseUrl, healthOk, blockDagOk, peers };
}

export async function buildTestnetChecklist(address = DEFAULT_MERCHANT_ADDRESS) {
  const addressInfo = validateAddress(address);
  const health = await testnetHealthCheck();
  const balance = addressInfo.isValid ? await fetchBalance(address) : null;

  return {
    ok: health.healthOk && health.blockDagOk && addressInfo.isValid,
    address: addressInfo,
    health,
    balance,
    checklist: [
      {
        item: "REST API health",
        ok: health.healthOk,
      },
      {
        item: "REST API blockDAG",
        ok: health.blockDagOk,
      },
      {
        item: "Merchant address format",
        ok: addressInfo.isValid,
      },
      {
        item: "Network/address alignment",
        ok: health.network !== "testnet-10" || addressInfo.isTestnet,
      },
    ],
  };
}

// ============================================================
// 내부 헬퍼
// ============================================================

function parseTransactionDetail(value: unknown): TransactionDetail | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  const outputs = collectAllOutputs(record);
  
  const txId = getString(record, ["transactionId", "transaction_id", "hash", "id"]) ?? "unknown";
  const blockHash = getString(record, ["blockHash", "block_hash"]) ?? undefined;
  const isAccepted = record.isAccepted === true || record.accepted === true;

  return {
    txId,
    blockHash,
    isAccepted,
    outputs,
  };
}

function collectAllOutputs(value: unknown): Array<{ address: string; kasAmount: number }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectAllOutputs);
  }

  const record = value as Record<string, unknown>;
  
  // Direct outputs field?
  if (Array.isArray(record.outputs)) {
    return record.outputs.flatMap(collectAllOutputs);
  }

  const address = getString(record, [
    "scriptPublicKeyAddress",
    "script_public_key_address",
    "address",
    "recipient",
  ]);
  
  const amount = getNumber(record, ["amount", "value"]);

  if (address && amount !== null) {
    // Kaspa는 satoshi 단위일 수 있음
    const kasAmount = amount > 1_000_000 ? amount / 100_000_000 : amount;
    return [{ address, kasAmount }];
  }

  // Nested search
  return Object.values(record).flatMap(collectAllOutputs);
}

function getNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "number") {
      return val;
    }

    if (typeof val === "string" && val !== "" && !Number.isNaN(Number(val))) {
      return Number(val);
    }
    // dotted key support
    const parts = key.split(".");
    let obj: Record<string, unknown> = record;
    let found = true;
    for (const part of parts) {
      if (obj[part] === undefined || obj[part] === null) {
        found = false;
        break;
      }
      obj = obj[part] as Record<string, unknown>;
    }
    if (found && typeof obj === "number") {
      return obj;
    }
  }
  return null;
}

function getString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "string" && val !== "") {
      return val;
    }
    // dotted key support
    const parts = key.split(".");
    let obj: Record<string, unknown> = record;
    let found = true;
    for (const part of parts) {
      if (obj[part] === undefined || obj[part] === null) {
        found = false;
        break;
      }
      obj = obj[part] as Record<string, unknown>;
    }
    if (found && typeof obj === "string" && obj !== "") {
      return obj;
    }
  }
  return null;
}
