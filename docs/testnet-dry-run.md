# KaspaFlow Testnet Dry Run

Use this checklist before trying a real merchant pilot.

## 1. Configure testnet

```bash
KASPA_NETWORK=testnet-10
KASPA_WATCHER_MODE=kaspa-rest
KASPA_REST_API_URL=
```

`KASPA_REST_API_URL` can stay empty. The app will use
`https://api-tn10.kaspa.org`.

## 2. Check REST connectivity

```bash
curl http://localhost:3000/api/kaspa/probe
curl http://localhost:3000/api/testnet
```

The response should show:

- `ok: true`
- `health.healthOk: true`
- `health.blockDagOk: true`
- `network: testnet-10`

## 3. Configure a testnet address

Set the active store address to a `kaspatest:` address in the merchant admin
panel, then create a small KRW payment request.

## 4. Send testnet KAS from a wallet

Send exactly the QR amount to the generated `kaspatest:` address. Then run:

```bash
curl -X POST http://localhost:3000/api/payments/sync \
  -H "x-kaspaflow-admin-token: $KASPAFLOW_ADMIN_TOKEN"
```

Expected status flow:

- `waiting`
- `seen` when transaction is visible but not accepted
- `confirmed` when accepted and amount matches
- `underpaid` or `overpaid` when amount differs

## 5. Verify refund tracking

Send a refund from the merchant wallet, then submit the refund transaction hash
in the payment panel. The app verifies the transaction output and stores the
result in the payment record and audit log.
