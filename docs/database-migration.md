# KaspaFlow Database Migration Plan

KaspaFlow currently uses file-backed storage under `KASPAFLOW_DATA_DIR`. That is
acceptable for a narrow pilot, but beta operation should move to PostgreSQL or
a PostgreSQL-compatible managed service.

## Target

- Keep the product non-custodial. No private keys are stored.
- Preserve existing payment IDs and audit event IDs during migration.
- Keep JSON files as a rollback backup until the DB-backed deployment has run
  through at least one complete business day.
- Use `db/schema.sql` as the first target schema.

## Data Sources

| File | Target tables |
| --- | --- |
| `payments.json` | `payments`, `payment_refunds`, `expired_payments` |
| `merchant-settings.json` | `merchant_settings`, `merchant_stores`, `merchant_employees` |
| `wallet-addresses.json` | `wallet_addresses` |
| `audit-events.json` | `audit_events` |

## Migration Steps

1. Stop writes by taking the merchant app offline or putting it behind a
   maintenance page.
2. Back up `KASPAFLOW_DATA_DIR`.
3. Create the database and apply `db/schema.sql`:

   ```bash
   DATABASE_URL=postgres://... npm run db:schema
   ```
4. Export the current JSON files into SQL:

   ```bash
   npm run db:export -- db/kaspaflow-import.sql
   ```

5. Review the generated SQL file before applying it.
6. Import stores, settings, wallets, payments, refunds, expiry markers, and
   audit events from the generated SQL.
7. Run reconciliation queries.
8. Start the DB-backed app with the same admin token, Kaspa network, and:

   ```bash
   KASPAFLOW_STORAGE_PROVIDER=postgres
   DATABASE_URL=postgres://...
   ```

9. Create one test payment, sync it, and export `/api/sales.csv`.

## Local Rehearsal

```bash
KASPAFLOW_ADMIN_TOKEN=dummy POSTGRES_PASSWORD=kaspaflow-dev \
  docker compose --profile postgres up -d postgres

DATABASE_URL=postgres://kaspaflow:kaspaflow-dev@localhost:5432/kaspaflow \
  npm run db:schema

KASPAFLOW_STORAGE_PROVIDER=postgres \
DATABASE_URL=postgres://kaspaflow:kaspaflow-dev@localhost:5432/kaspaflow \
KASPAFLOW_ADMIN_TOKEN=dummy \
KASPAFLOW_ENABLE_SIMULATION=true \
KASPA_WATCHER_MODE=mock \
  npm run dev -- --port 3003

KASPAFLOW_BASE_URL=http://localhost:3003 \
KASPAFLOW_ADMIN_TOKEN=dummy \
  npm run smoke:postgres
```

Docker Compose beta shape:

```bash
export KASPAFLOW_ADMIN_TOKEN=<strong-random-token>
export POSTGRES_PASSWORD=<strong-random-password>
export DATABASE_URL=postgres://kaspaflow:$POSTGRES_PASSWORD@postgres:5432/kaspaflow
export KASPAFLOW_STORAGE_PROVIDER=postgres

docker compose --profile postgres up --build -d
docker compose exec kaspaflow npm run db:schema
```

Minimum checks:

- `GET /api/health` reports `storageProvider: postgres` and `storage.ready: true`.
- `GET /api/admin` creates or reads the default merchant settings.
- `POST /api/payments` creates a payment row.
- `POST /api/payments/:id/simulate` returns the updated status immediately.
- Authenticated `GET /api/analytics` and `GET /api/audit` reflect the payment.

`npm run smoke:postgres` performs those checks automatically against the
configured `KASPAFLOW_BASE_URL`.

## Backup Command

```bash
tar -czf kaspaflow-data-$(date +%Y-%m-%d).tgz "$KASPAFLOW_DATA_DIR"
```

For Docker Compose deployments, copy the mounted volume contents or run the
backup command inside the application container.

## Reconciliation Queries

```sql
select status, count(*) from payments group by status order by status;

select
  count(*) filter (where simulated = false and status in ('confirmed', 'overpaid')) as real_sales,
  count(*) filter (where simulated = true and status in ('confirmed', 'overpaid')) as simulated_sales
from payments;

select count(*) from payment_refunds where status <> 'none';

select type, count(*)
from audit_events
group by type
order by count(*) desc;
```

Compare these counts with:

- `/api/analytics`
- `/api/sales.csv`
- the old JSON file lengths
- the merchant wallet transaction history

## Adapter Cutover Notes

The current API surface should not change. A DB adapter should preserve these
function names before replacing the file-backed implementation:

- `listPayments`
- `getPayment`
- `createPayment`
- `updatePaymentStatus`
- `updatePaymentRefund`
- `getSalesSummary`
- `expireExpiredPayments`
- `getMerchantSettings`
- `updateMerchantSettings`
- `upsertStore`
- `setActiveStore`
- `upsertEmployee`
- `setEmployeeActive`
- `listWalletAddresses`
- `upsertWalletAddress`
- `setWalletAddressActive`
- `listAuditEvents`
- `appendAuditEvent`

Use `KASPAFLOW_STORAGE_PROVIDER=file` as the default during the pilot.
`KASPAFLOW_STORAGE_PROVIDER=postgres` enables the runtime Postgres adapter.
The app requires `DATABASE_URL` in that mode and will report readiness through
`/api/health`.

The runtime adapter now covers:

- payments and refund records
- expiry markers
- merchant settings, stores, and employees
- wallet address book
- audit events

## Rollback

If the DB-backed app shows inconsistent totals or payment states:

1. Stop the DB-backed app.
2. Restore the original file-backed deployment and `KASPAFLOW_DATA_DIR`.
3. Run `/api/health`, authenticated `/api/analytics`, and authenticated
   `/api/payments/sync?silent=1`.
4. Keep the failed DB snapshot for analysis.

Do not attempt partial manual edits to live payment rows while the merchant is
accepting payments.
