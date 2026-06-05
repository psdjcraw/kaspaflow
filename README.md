# KaspaFlow

KaspaFlow is a non-custodial Kaspa-only payment helper for small merchants.

The first product target is a simple cafe or chicken shop counter flow:

1. Enter a KRW order amount.
2. Convert it to KAS for a short payment window.
3. Show a QR code and direct Kaspa address.
4. Watch the Kaspa chain for the matching payment.
5. Keep a merchant-side sales log.

The app is intentionally designed so merchants receive KAS directly into their own wallet. KaspaFlow should not custody funds, convert funds, or settle KRW without a separate legal review.

## Development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.
