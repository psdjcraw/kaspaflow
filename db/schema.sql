-- KaspaFlow pilot-to-beta PostgreSQL schema.
-- The app still uses file-backed storage today; this schema is the target
-- structure for the next persistence adapter.

create table if not exists merchant_stores (
  id text primary key,
  name text not null,
  merchant_address text not null,
  default_currency text not null check (default_currency in ('KRW', 'USD', 'EUR', 'JPY')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists merchant_settings (
  id text primary key default 'default',
  merchant_name text not null,
  merchant_address text not null,
  default_currency text not null check (default_currency in ('KRW', 'USD', 'EUR', 'JPY')),
  active_store_id text references merchant_stores(id),
  updated_at timestamptz not null default now(),
  constraint single_settings_row check (id = 'default')
);

create table if not exists merchant_employees (
  id text primary key,
  name text not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallet_addresses (
  id text primary key,
  label text not null,
  address text not null,
  store_id text references merchant_stores(id),
  network text not null check (network in ('mainnet', 'testnet-10')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (address, network)
);

create table if not exists payments (
  id text primary key,
  merchant_name text not null,
  merchant_address text not null,
  fiat_amount numeric(18, 4) not null check (fiat_amount > 0),
  fiat_currency text not null check (fiat_currency in ('KRW', 'USD', 'EUR', 'JPY')),
  rate_fiat_per_kas numeric(24, 8) not null check (rate_fiat_per_kas > 0),
  kas_amount numeric(24, 8) not null check (kas_amount > 0),
  status text not null check (
    status in ('waiting', 'seen', 'confirmed', 'underpaid', 'overpaid', 'expired')
  ),
  tx_hash text,
  received_kas_amount numeric(24, 8),
  simulated boolean not null default false,
  qr_payload text,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx on payments(status);
create index if not exists payments_created_at_idx on payments(created_at desc);
create index if not exists payments_expires_at_idx on payments(expires_at);
create index if not exists payments_tx_hash_idx on payments(tx_hash) where tx_hash is not null;

create table if not exists payment_refunds (
  payment_id text primary key references payments(id) on delete cascade,
  status text not null check (status in ('none', 'requested', 'tx-provided', 'confirmed', 'rejected')),
  customer_address text,
  kas_amount numeric(24, 8),
  tx_hash text,
  reason text,
  note text,
  requested_at timestamptz,
  checked_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key,
  type text not null,
  message text not null,
  payment_id text references payments(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_at_idx on audit_events(created_at desc);
create index if not exists audit_events_type_idx on audit_events(type);
create index if not exists audit_events_payment_id_idx on audit_events(payment_id);

create table if not exists expired_payments (
  payment_id text primary key references payments(id) on delete cascade,
  expired_at timestamptz not null default now()
);
