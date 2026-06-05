# KaspaFlow

KaspaFlow is a non-custodial Kaspa-only payment helper for small merchants.

The first product target is a simple cafe, chicken shop, or local retail
counter flow:

1. Enter a KRW order amount.
2. Convert it to KAS for a short payment window.
3. Show a QR code and direct Kaspa address.
4. Watch the Kaspa chain for the matching payment.
5. Keep a merchant-side sales log.

The app is intentionally designed so merchants receive KAS directly into their own wallet. KaspaFlow should not custody funds, convert funds, or settle KRW without a separate legal review.

## Current MVP

- Merchant name and Kaspa receiving address form
- Server-side KAS/KRW quote endpoint
- Payment request API with expiry and calculated KAS amount
- QR generation in the browser
- Payment status polling through a watcher abstraction
- In-memory sales log
- CSV export at `/api/sales.csv`
- Korean and global plan infographic assets under `public/infographics`

The current watcher is a mock implementation for product and UI development.
It marks a payment as `seen` after 10 seconds and `confirmed` after 30 seconds.
Replace `MockKaspaPaymentWatcher` in `lib/watcher.ts` with a Kaspa node/API
implementation before pilot use.

## Development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

If port 3000 is busy, Next.js will print the fallback port.

## Configuration

```bash
KAS_KRW_RATE=350
```

When `KAS_KRW_RATE` is not set, the quote endpoint uses a mock rate of 350 KRW
per KAS.

## API

- `GET /api/quote` returns the current KAS/KRW quote.
- `GET /api/payments` lists payment requests in the in-memory store.
- `POST /api/payments` creates a payment request.
- `GET /api/payments/:id` syncs the request with the watcher and returns status.
- `GET /api/sales.csv` downloads the current sales log.

Example payment creation:

```bash
curl -X POST http://localhost:3000/api/payments \
  -H 'Content-Type: application/json' \
  -d '{
    "merchantName": "Pilot Cafe",
    "merchantAddress": "kaspa:qz7placeholdermerchantaddressreplacebeforeliveuse",
    "krwAmount": 21000
  }'
```

## Pilot Notes

Before using this with a real merchant:

- Replace the placeholder Kaspa address.
- Replace the mock price provider with a real quote source.
- Replace the mock watcher with a Kaspa network watcher.
- Add durable storage such as Postgres.
- Review legal, tax, refund, custody, and payment-processing implications.
