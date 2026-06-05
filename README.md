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
- Server-side KAS/fiat quote endpoint for KRW, USD, EUR, and JPY
- Payment request API with expiry and calculated KAS amount
- QR generation in the browser
- Payment status polling through a watcher abstraction
- File-backed local sales log
- CSV export at `/api/sales.csv`
- Korean and global plan infographic assets under `public/infographics`

The default watcher is a mock implementation for product and UI development.
It marks a payment as `seen` after 10 seconds and `confirmed` after 30 seconds.
Set `KASPA_WATCHER_MODE=kaspa-rest` to use the REST watcher path against
`KASPA_REST_API_URL`.

## Development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

If port 3000 is busy, Next.js will print the fallback port.

## Configuration

```bash
QUOTE_FIAT=KRW
KAS_PRICE_SOURCE=auto
KAS_KRW_RATE=350
KAS_USD_RATE=0.25
KAS_EUR_RATE=0.23
KAS_JPY_RATE=39
KASPAFLOW_DATA_DIR=./data
KASPA_WATCHER_MODE=mock
KASPA_REST_API_URL=https://api.kaspa.org
```

`KAS_PRICE_SOURCE` accepts:

- `auto`: use Coinone for KAS/KRW and CoinGecko for other fiat quotes.
- `coinone`: fetch KAS/KRW from Coinone and fall back to CoinGecko if needed.
- `coingecko`: fetch KAS prices from CoinGecko and fall back to mock if the
  request fails.
- `mock`: use configured env rates or built-in development defaults.

When `KAS_PRICE_SOURCE` is not set, the quote endpoint uses `auto` live quotes.
Mock defaults are only used when live requests fail or when
`KAS_PRICE_SOURCE=mock` is explicitly set.

`KASPAFLOW_DATA_DIR` controls where `payments.json` is written. The default is
`./data`, which is ignored by git.

`KASPA_WATCHER_MODE` accepts:

- `mock`: deterministic local status simulation for UI development.
- `kaspa-rest`: polls `/addresses/{address}/full-transactions` from the
  configured Kaspa REST API.

## API

- `GET /api/quote?fiat=USD` returns the current KAS/fiat quote.
- `GET /api/health` returns service, watcher, and quote health metadata.
- `GET /api/payments` lists payment requests in the file-backed store.
- `POST /api/payments` creates a payment request.
- `GET /api/payments/:id` syncs the request with the watcher and returns status.
- `GET /api/sales.csv` downloads the current sales log.

Example payment creation:

```bash
curl -X POST http://localhost:3000/api/payments \
  -H 'Content-Type: application/json' \
  -d '{
    "merchantName": "Pilot Cafe",
    "merchantAddress": "kaspa:q000000000000000000000000000000000000000000000000000000000000",
    "fiatAmount": 21000,
    "fiatCurrency": "KRW"
  }'
```

## Pilot Notes

Before using this with a real merchant:

- Replace the placeholder Kaspa address.
- Use `KAS_PRICE_SOURCE=coingecko` or another real quote source.
- Test `kaspa-rest` watcher mode with small real payments.
- Move from file-backed storage to Postgres before multi-store beta.
- Review legal, tax, refund, custody, and payment-processing implications.

## References

- Kaspa REST API: <https://api.kaspa.org/docs>
- CoinGecko simple price API: <https://docs.coingecko.com/reference/simple-price>
