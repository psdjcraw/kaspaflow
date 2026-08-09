#!/usr/bin/env node

const baseUrl = (process.env.KASPAFLOW_BASE_URL ?? "http://localhost:3003")
  .replace(/\/$/, "");
const adminToken = process.env.KASPAFLOW_ADMIN_TOKEN;
const merchantAddress = process.env.KASPAFLOW_SMOKE_ADDRESS ??
  "kaspa:q000000000000000000000000000000000000000000000000000000000000";

const adminHeaders = adminToken
  ? { "x-kaspaflow-admin-token": adminToken }
  : {};
const jsonHeaders = {
  "content-type": "application/json",
  ...adminHeaders,
};
const results = [];

const health = await check("health", () => getJson("/api/health"));
assert(health.ok === true, "health must report ok=true");
assert(health.storage?.ready === true, "storage must be ready");

const quote = await check("quote", () => getJson("/api/quote?fiat=KRW"));
assert(quote.fiatCurrency === "KRW", "quote must return KRW");
assert(quote.rateFiatPerKas > 0, "quote must return a positive KAS rate");

const admin = await check("admin", () => getJson("/api/admin", true));
assert(admin.settings?.merchantName, "admin settings must include merchantName");

const created = await check("createPayment", () =>
  postJson("/api/payments", {
    merchantName: "KaspaFlow Local Smoke",
    merchantAddress,
    fiatAmount: 1000,
    fiatCurrency: "KRW",
  })
);
const paymentId = created.payment?.id;
assert(paymentId, "payment creation must return an id");
assert(created.kaspaUri?.includes(merchantAddress), "kaspaUri must include address");

const payment = await check("paymentDetailApi", () =>
  getJson(`/api/payments/${paymentId}`, true)
);
assert(payment.payment?.id === paymentId, "payment detail API must return the created payment");

const detailPage = await check("paymentDetailPage", () =>
  getText(`/payments/${paymentId}`)
);
assert(detailPage.includes(paymentId), "payment detail page must include the payment id");

const customerPage = await check("customerDisplayPage", () =>
  getText(`/payments/${paymentId}/display`)
);
assert(customerPage.includes(paymentId), "customer display page must include the payment id");

const sync = await check("syncOpenPayments", () =>
  postJson("/api/payments/sync?silent=1")
);
assert(Number.isFinite(sync.summary?.checked), "sync must return a checked count");

if (health.simulationEnabled) {
  const simulated = await check("simulatePayment", () =>
    postJson(`/api/payments/${paymentId}/simulate`, {
      status: "confirmed",
    })
  );
  assert(
    simulated.payment?.status === "confirmed",
    "simulation must return confirmed payment",
  );
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  paymentId,
  simulationChecked: Boolean(health.simulationEnabled),
  checkedAt: new Date().toISOString(),
  results,
}, null, 2));

async function check(name, action) {
  const startedAt = Date.now();
  const payload = await action();
  results.push({
    name,
    ok: true,
    latencyMs: Date.now() - startedAt,
  });
  return payload;
}

async function getJson(path, authed = false) {
  return requestJson(path, {
    headers: authed ? adminHeaders : undefined,
  });
}

async function postJson(path, body) {
  return requestJson(path, {
    method: "POST",
    headers: jsonHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} returned non-JSON response: ${text}`);
  }

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${text}`);
  }

  return payload;
}

async function getText(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: adminHeaders,
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${text}`);
  }

  return text;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
