# KaspaFlow Beta Readiness Checklist

Use this checklist after the narrow pilot and before allowing multiple stores or
long-running merchant operation.

## Gate 1: Security

- `KASPAFLOW_ADMIN_TOKEN` is set in every non-local environment.
- Simulation is disabled with `KASPAFLOW_ENABLE_SIMULATION=false`.
- Merchant devices are locked and only trusted staff can access the admin panel.
- Webhook URLs are private and rotateable.
- No private keys, seed phrases, or custody credentials are stored by KaspaFlow.

Stop the beta if admin auth is off or if any wallet private material has been
entered into the app.

## Gate 2: Payments

- Mainnet watcher mode is `kaspa-rest`.
- A small real mainnet payment has moved from `waiting` to `confirmed`.
- Underpaid and overpaid cases have been tested with small amounts.
- Expired payments are excluded from sales totals.
- Simulated payments are excluded from real sales totals.
- Refund hash verification works for at least one test refund.

Stop the beta if sales totals do not reconcile with the merchant wallet.

## Gate 3: Storage

- `KASPAFLOW_DATA_DIR` is backed up automatically.
- The Postgres target schema in `db/schema.sql` has been reviewed.
- `docs/database-migration.md` has been rehearsed with copied pilot data.
- The file-backed deployment remains restorable until the DB-backed adapter is
  verified.

Stop the beta if file storage is the only copy of payment or audit data.

## Gate 4: Operations

- `/api/health` is monitored.
- `/api/errors` is checked daily.
- `/api/reports/daily` is sent at business close.
- `/api/sales.csv` is exported and retained.
- Webhook notification delivery is tested.
- Staff know how to handle `waiting`, `seen`, `underpaid`, `overpaid`, and
  `expired` statuses.

Stop the beta if staff cannot explain what to do for underpaid or overpaid
payments.

## Gate 5: Merchant UX

- PWA install works on the target merchant device.
- Offline fallback opens when the device is disconnected.
- QR code opens a Kaspa wallet with the expected address and amount.
- Customer-facing payment detail pages are readable on a phone.
- The payment screen does not require exposing the admin token to customers.

Stop the beta if customers can see admin-only controls or if the QR opens the
wrong network/address.

## Gate 6: Legal And Accounting

- Local tax treatment for KAS receipts has been reviewed.
- Refund policy is written and visible to staff.
- Sales CSV retention policy is defined.
- Exchange-rate source and quote timestamp policy are documented.
- Any required payment-processing, consumer-protection, or crypto-asset review
  is complete.

Stop the beta if accounting cannot reconstruct a sale from wallet transaction,
KaspaFlow payment ID, quote, and sales CSV row.

## Launch Decision

Beta is allowed only when every gate is green:

- Security: green
- Payments: green
- Storage: green
- Operations: green
- Merchant UX: green
- Legal and accounting: green

Record the launch decision in the merchant operations log with:

- date
- store name
- active Kaspa address
- operator
- app commit hash
- backup location
- known risks
