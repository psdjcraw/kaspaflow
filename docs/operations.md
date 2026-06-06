# KaspaFlow Operations

Use this checklist before exposing KaspaFlow to a merchant device or running a
small mainnet payment test.

## Required Environment

```bash
NODE_ENV=production
QUOTE_FIAT=KRW
KAS_PRICE_SOURCE=auto
KASPAFLOW_DATA_DIR=/app/data
KASPAFLOW_STORAGE_PROVIDER=file
KASPA_WATCHER_MODE=kaspa-rest
KASPAFLOW_BACKGROUND_SYNC_ENABLED=true
KASPAFLOW_BACKGROUND_SYNC_INTERVAL_MS=15000
KASPA_NETWORK=mainnet
KASPA_REST_API_URL=
KASPAFLOW_ENABLE_SIMULATION=false
KASPAFLOW_ADMIN_TOKEN=<strong-random-token>
KASPAFLOW_NOTIFY_WEBHOOK_URL=
```

Keep `KASPAFLOW_ENABLE_SIMULATION=false` for real payments. Use a non-empty
`KASPAFLOW_ADMIN_TOKEN` before exposing the app beyond localhost.

## Startup

```bash
npm ci
npm run build
npm run start
```

Docker:

```bash
export KASPAFLOW_ADMIN_TOKEN=<strong-random-token>
docker compose up --build -d
```

## Health Checks

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/kaspa/probe
curl -X POST 'http://localhost:3000/api/payments/sync?silent=1' \
  -H 'x-kaspaflow-admin-token: <strong-random-token>'
curl -X POST http://localhost:3000/api/reports/daily \
  -H 'x-kaspaflow-admin-token: <strong-random-token>'
```

Expected:

- `watcherMode` is `kaspa-rest`.
- `storageProvider` is `file` during the pilot.
- `backgroundSync.enabled` is `true`.
- `backgroundSync.lastError` is `null`.
- `quote.source` is `coinone` or `coingecko` during normal live operation.

## Merchant Device Setup

1. Open KaspaFlow in Chrome, Edge, or Safari.
2. Add it to the home screen or install it when prompted.
3. Enter the admin token in the admin panel.
4. Confirm the active store name and Kaspa receiving address.
5. Create a small test payment and verify the QR opens the expected wallet URI.

## Mainnet Payment Test

1. Use a tiny KRW amount that converts to a small KAS value.
2. Create a payment from the merchant device.
3. Send KAS from an external wallet to the displayed address.
4. Watch the payment progress from `waiting` to `seen` or `confirmed`.
5. Confirm `/api/health` shows background sync running without errors.
6. Export `/api/sales.csv` and confirm the payment appears once.
7. Confirm simulated payments are excluded from real sales totals.

## Data Files

KaspaFlow stores local operational data in `KASPAFLOW_DATA_DIR`:

- `payments.json`
- `audit-events.json`
- merchant and wallet store files

Back up this directory before updating or moving a pilot deployment.

## Operational Limits

- KaspaFlow does not custody private keys.
- Refunds are recorded and verified, but the merchant sends refunds from their own wallet.
- File-backed storage is acceptable for a narrow pilot only.
- Move to a real database before multi-device or multi-store beta use.
- Review tax, refund, accounting, and local payment-processing rules before production use.
