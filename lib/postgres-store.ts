import "server-only";

import {
  DEFAULT_MERCHANT_ADDRESS,
  createPaymentRequest,
  type FiatCurrency,
  type KaspaPaymentRequest,
  type PaymentStatus,
  type RefundRecord,
} from "./kaspa";
import { getKaspaNetwork, type KaspaNetwork } from "./kaspa-network";
import type {
  MerchantEmployee,
  MerchantSettings,
  MerchantStore,
} from "./merchant-store";
import { query } from "./postgres";
import type { CreatePaymentInput } from "./payment-store";
import type { AuditEvent } from "./audit-store";
import type { WalletAddressRecord } from "./wallet-store";

type PaymentRow = {
  id: string;
  merchant_address: string;
  merchant_name: string;
  fiat_amount: string;
  fiat_currency: FiatCurrency;
  rate_fiat_per_kas: string;
  kas_amount: string;
  expires_at: Date;
  created_at: Date;
  status: PaymentStatus;
  tx_hash: string | null;
  received_kas_amount: string | null;
  simulated: boolean;
  refund_status: RefundRecord["status"] | null;
  refund_customer_address: string | null;
  refund_kas_amount: string | null;
  refund_reason: string | null;
  refund_requested_at: Date | null;
  refund_tx_hash: string | null;
  refund_checked_at: Date | null;
  refund_confirmed_at: Date | null;
  refund_note: string | null;
};

export async function listPostgresPayments() {
  await expirePostgresPayments();
  const result = await query<PaymentRow>(
    `${paymentSelectSql} order by p.created_at desc`,
  );

  return result.rows.map(rowToPayment);
}

export async function getPostgresPayment(id: string) {
  const result = await query<PaymentRow>(
    `${paymentSelectSql} where p.id = $1`,
    [id],
  );

  return result.rows[0] ? rowToPayment(result.rows[0]) : null;
}

export async function createPostgresPayment(input: CreatePaymentInput) {
  const payment = createPaymentRequest(
    input.fiatAmount,
    input.fiatCurrency,
    input.rateFiatPerKas,
    input.merchantAddress.trim(),
    input.merchantName.trim(),
  );

  await query(
    `insert into payments (
      id, merchant_name, merchant_address, fiat_amount, fiat_currency,
      rate_fiat_per_kas, kas_amount, status, created_at, expires_at, simulated
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      payment.id,
      payment.merchantName,
      payment.merchantAddress,
      payment.fiatAmount,
      payment.fiatCurrency,
      payment.rateFiatPerKas,
      payment.kasAmount,
      payment.status,
      payment.createdAt,
      payment.expiresAt,
      payment.simulated ?? false,
    ],
  );

  return payment;
}

export async function updatePostgresPaymentStatus(
  id: string,
  status: PaymentStatus,
  values: Partial<
    Pick<KaspaPaymentRequest, "txHash" | "receivedKasAmount" | "simulated">
  > = {},
) {
  const result = await query<{ id: string }>(
    `update payments
     set
       status = $2,
       tx_hash = coalesce($3, tx_hash),
       received_kas_amount = coalesce($4, received_kas_amount),
       simulated = coalesce($5, simulated),
       updated_at = now()
     where id = $1
     returning id`,
    [
      id,
      status,
      values.txHash ?? null,
      values.receivedKasAmount ?? null,
      values.simulated ?? null,
    ],
  );

  return result.rows[0] ? getPostgresPayment(id) : null;
}

export async function updatePostgresPaymentRefund(
  id: string,
  refund: RefundRecord,
) {
  await query(
    `insert into payment_refunds (
      payment_id, status, customer_address, kas_amount, tx_hash, reason, note,
      requested_at, checked_at, confirmed_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
    on conflict (payment_id) do update set
      status = excluded.status,
      customer_address = coalesce(excluded.customer_address, payment_refunds.customer_address),
      kas_amount = coalesce(excluded.kas_amount, payment_refunds.kas_amount),
      tx_hash = coalesce(excluded.tx_hash, payment_refunds.tx_hash),
      reason = coalesce(excluded.reason, payment_refunds.reason),
      note = coalesce(excluded.note, payment_refunds.note),
      requested_at = coalesce(excluded.requested_at, payment_refunds.requested_at),
      checked_at = coalesce(excluded.checked_at, payment_refunds.checked_at),
      confirmed_at = coalesce(excluded.confirmed_at, payment_refunds.confirmed_at),
      updated_at = now()`,
    [
      id,
      refund.status,
      refund.customerAddress ?? null,
      refund.kasAmount ?? null,
      refund.txHash ?? null,
      refund.reason ?? null,
      refund.note ?? null,
      refund.requestedAt ?? null,
      refund.checkedAt ?? null,
      refund.confirmedAt ?? null,
    ],
  );

  return getPostgresPayment(id);
}

export async function expirePostgresPayments() {
  const result = await query<{ id: string }>(
    `update payments
      set status = 'expired', updated_at = now()
      where status in ('waiting', 'seen', 'underpaid')
        and expires_at < now()
      returning id`,
  );

  if (result.rows.length) {
    await query(
      `insert into expired_payments (payment_id)
       select unnest($1::text[])
       on conflict (payment_id) do nothing`,
      [result.rows.map((row) => row.id)],
    );
  }

  return {
    changed: result.rows.length,
    expiredIds: result.rows.map((row) => row.id),
  };
}

export async function getPostgresExpiryStats() {
  const result = await query<{ last_run: Date | null; count: string }>(
    `select max(expired_at) as last_run, count(*)::text as count from expired_payments`,
  );
  const row = result.rows[0];

  return {
    lastRun: row?.last_run?.toISOString() ?? "",
    count: Number(row?.count ?? 0),
  };
}

export async function listPostgresAuditEvents(limit = 30) {
  const result = await query<{
    id: string;
    type: string;
    message: string;
    payment_id: string | null;
    metadata: AuditEvent["metadata"] | null;
    created_at: Date;
  }>(
    `select * from audit_events order by created_at desc limit $1`,
    [limit],
  );

  return result.rows.map((row): AuditEvent => ({
    id: row.id,
    type: row.type,
    message: row.message,
    paymentId: row.payment_id ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function appendPostgresAuditEvent(
  event: Omit<AuditEvent, "id" | "createdAt">,
) {
  const nextEvent: AuditEvent = {
    ...event,
    id: `AUD-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  };

  await query(
    `insert into audit_events (id, type, message, payment_id, metadata, created_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      nextEvent.id,
      nextEvent.type,
      nextEvent.message,
      nextEvent.paymentId ?? null,
      nextEvent.metadata ?? null,
      nextEvent.createdAt,
    ],
  );

  return nextEvent;
}

export async function getPostgresMerchantSettings() {
  await ensureDefaultMerchantSettings();
  const [settingsResult, storesResult, employeesResult] = await Promise.all([
    query<{
      merchant_name: string;
      merchant_address: string;
      default_currency: FiatCurrency;
      active_store_id: string;
      updated_at: Date;
    }>(
      `select merchant_name, merchant_address, default_currency, active_store_id, updated_at
       from merchant_settings where id = 'default'`,
    ),
    query<{
      id: string;
      name: string;
      merchant_address: string;
      default_currency: FiatCurrency;
      active: boolean;
    }>(`select * from merchant_stores order by created_at asc`),
    query<{
      id: string;
      name: string;
      role: string;
      active: boolean;
    }>(`select id, name, role, active from merchant_employees order by created_at asc`),
  ]);
  const settings = settingsResult.rows[0];

  return {
    merchantName: settings.merchant_name,
    merchantAddress: settings.merchant_address,
    defaultCurrency: settings.default_currency,
    activeStoreId: settings.active_store_id,
    stores: storesResult.rows.map(rowToStore),
    employees: employeesResult.rows.map(rowToEmployee),
    updatedAt: settings.updated_at.toISOString(),
  };
}

export async function updatePostgresMerchantSettings(
  input: Partial<Omit<MerchantSettings, "employees" | "updatedAt">>,
) {
  const current = await getPostgresMerchantSettings();
  const merchantName = input.merchantName?.trim() ?? current.merchantName;
  const merchantAddress = input.merchantAddress?.trim() ?? current.merchantAddress;
  const defaultCurrency = input.defaultCurrency ?? current.defaultCurrency;
  const activeStoreId = input.activeStoreId ?? current.activeStoreId;

  await query(
    `update merchant_settings
     set merchant_name = $1, merchant_address = $2, default_currency = $3,
       active_store_id = $4, updated_at = now()
     where id = 'default'`,
    [merchantName, merchantAddress, defaultCurrency, activeStoreId],
  );
  await query(
    `update merchant_stores
     set name = $1, merchant_address = $2, default_currency = $3, updated_at = now()
     where id = $4`,
    [merchantName, merchantAddress, defaultCurrency, activeStoreId],
  );

  return getPostgresMerchantSettings();
}

export async function upsertPostgresStore(input: Partial<MerchantStore>) {
  const id = input.id ?? `STORE-${Date.now().toString(36).toUpperCase()}`;

  await query(
    `insert into merchant_stores (
      id, name, merchant_address, default_currency, active, updated_at
    ) values ($1, $2, $3, $4, $5, now())
    on conflict (id) do update set
      name = excluded.name,
      merchant_address = excluded.merchant_address,
      default_currency = excluded.default_currency,
      active = excluded.active,
      updated_at = now()`,
    [
      id,
      String(input.name ?? "").trim(),
      String(input.merchantAddress ?? "").trim(),
      input.defaultCurrency ?? "KRW",
      input.active ?? true,
    ],
  );

  return getPostgresMerchantSettings();
}

export async function setPostgresActiveStore(id: string) {
  const store = await query<{
    name: string;
    merchant_address: string;
    default_currency: FiatCurrency;
  }>(
    `select name, merchant_address, default_currency from merchant_stores where id = $1`,
    [id],
  );

  if (!store.rows[0]) {
    throw new Error("Store not found.");
  }

  await query(
    `update merchant_settings
     set active_store_id = $1, merchant_name = $2, merchant_address = $3,
       default_currency = $4, updated_at = now()
     where id = 'default'`,
    [
      id,
      store.rows[0].name,
      store.rows[0].merchant_address,
      store.rows[0].default_currency,
    ],
  );

  return getPostgresMerchantSettings();
}

export async function upsertPostgresEmployee(input: Partial<MerchantEmployee>) {
  const id = input.id ?? `EMP-${Date.now().toString(36).toUpperCase()}`;

  await query(
    `insert into merchant_employees (id, name, role, active, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (id) do update set
       name = excluded.name,
       role = excluded.role,
       active = excluded.active,
       updated_at = now()`,
    [
      id,
      String(input.name ?? "").trim(),
      String(input.role ?? "").trim(),
      input.active ?? true,
    ],
  );

  return getPostgresMerchantSettings();
}

export async function setPostgresEmployeeActive(id: string, active: boolean) {
  const result = await query(
    `update merchant_employees set active = $2, updated_at = now() where id = $1`,
    [id, active],
  );

  if (!result.rowCount) {
    throw new Error("Employee not found.");
  }

  return getPostgresMerchantSettings();
}

export async function listPostgresWalletAddresses() {
  const result = await query<{
    id: string;
    label: string;
    address: string;
    store_id: string | null;
    network: KaspaNetwork;
    active: boolean;
    created_at: Date;
  }>(
    `select id, label, address, store_id, network, active, created_at
     from wallet_addresses order by created_at desc`,
  );

  return result.rows.map((row): WalletAddressRecord => ({
    id: row.id,
    label: row.label,
    address: row.address,
    storeId: row.store_id ?? undefined,
    network: row.network,
    active: row.active,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function upsertPostgresWalletAddress(
  input: Partial<WalletAddressRecord>,
) {
  const id = input.id ?? `WAL-${Date.now().toString(36).toUpperCase()}`;

  await query(
    `insert into wallet_addresses (
      id, label, address, store_id, network, active, updated_at
    ) values ($1, $2, $3, $4, $5, $6, now())
    on conflict (id) do update set
      label = excluded.label,
      address = excluded.address,
      store_id = excluded.store_id,
      network = excluded.network,
      active = excluded.active,
      updated_at = now()`,
    [
      id,
      String(input.label ?? "").trim(),
      String(input.address ?? "").trim(),
      input.storeId ?? null,
      input.network ?? getKaspaNetwork(),
      input.active ?? true,
    ],
  );

  return listPostgresWalletAddresses();
}

export async function setPostgresWalletAddressActive(id: string, active: boolean) {
  const result = await query(
    `update wallet_addresses set active = $2, updated_at = now() where id = $1`,
    [id, active],
  );

  if (!result.rowCount) {
    throw new Error("Wallet address not found.");
  }

  return listPostgresWalletAddresses();
}

const paymentSelectSql = `
  select
    p.*,
    r.status as refund_status,
    r.customer_address as refund_customer_address,
    r.kas_amount as refund_kas_amount,
    r.reason as refund_reason,
    r.requested_at as refund_requested_at,
    r.tx_hash as refund_tx_hash,
    r.checked_at as refund_checked_at,
    r.confirmed_at as refund_confirmed_at,
    r.note as refund_note
  from payments p
  left join payment_refunds r on r.payment_id = p.id
`;

function rowToPayment(row: PaymentRow): KaspaPaymentRequest {
  const refund = row.refund_status
    ? {
        status: row.refund_status,
        customerAddress: row.refund_customer_address ?? undefined,
        kasAmount: row.refund_kas_amount ? Number(row.refund_kas_amount) : undefined,
        reason: row.refund_reason ?? undefined,
        requestedAt: row.refund_requested_at?.toISOString(),
        txHash: row.refund_tx_hash ?? undefined,
        checkedAt: row.refund_checked_at?.toISOString(),
        confirmedAt: row.refund_confirmed_at?.toISOString(),
        note: row.refund_note ?? undefined,
      }
    : { status: "none" as const };

  return {
    id: row.id,
    merchantAddress: row.merchant_address,
    merchantName: row.merchant_name,
    fiatAmount: Number(row.fiat_amount),
    fiatCurrency: row.fiat_currency,
    rateFiatPerKas: Number(row.rate_fiat_per_kas),
    kasAmount: Number(row.kas_amount),
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    status: row.status,
    txHash: row.tx_hash ?? undefined,
    receivedKasAmount: row.received_kas_amount
      ? Number(row.received_kas_amount)
      : undefined,
    simulated: row.simulated,
    krwAmount: row.fiat_currency === "KRW" ? Number(row.fiat_amount) : undefined,
    rateKrwPerKas: row.fiat_currency === "KRW"
      ? Number(row.rate_fiat_per_kas)
      : undefined,
    refund,
  };
}

async function ensureDefaultMerchantSettings() {
  await query(
    `insert into merchant_stores (
      id, name, merchant_address, default_currency, active
    ) values ('STORE-MAIN', 'KaspaFlow Cafe', $1, 'KRW', true)
    on conflict (id) do nothing`,
    [DEFAULT_MERCHANT_ADDRESS],
  );
  await query(
    `insert into merchant_settings (
      id, merchant_name, merchant_address, default_currency, active_store_id
    ) values ('default', 'KaspaFlow Cafe', $1, 'KRW', 'STORE-MAIN')
    on conflict (id) do nothing`,
    [DEFAULT_MERCHANT_ADDRESS],
  );
  await query(
    `insert into merchant_employees (id, name, role, active)
     values ('EMP-OWNER', 'Owner', 'owner', true)
     on conflict (id) do nothing`,
  );
}

function rowToStore(row: {
  id: string;
  name: string;
  merchant_address: string;
  default_currency: FiatCurrency;
  active: boolean;
}): MerchantStore {
  return {
    id: row.id,
    name: row.name,
    merchantAddress: row.merchant_address,
    defaultCurrency: row.default_currency,
    active: row.active,
  };
}

function rowToEmployee(row: {
  id: string;
  name: string;
  role: string;
  active: boolean;
}): MerchantEmployee {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active,
  };
}
