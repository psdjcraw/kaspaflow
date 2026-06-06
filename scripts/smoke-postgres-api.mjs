#!/usr/bin/env node

const baseUrl = process.env.KASPAFLOW_BASE_URL ?? "http://localhost:3003";
const adminToken = process.env.KASPAFLOW_ADMIN_TOKEN;
const merchantAddress = process.env.KASPAFLOW_SMOKE_ADDRESS ??
  "kaspa:q000000000000000000000000000000000000000000000000000000000000";

if (!adminToken) {
  console.error("KASPAFLOW_ADMIN_TOKEN is required.");
  process.exit(1);
}

const adminHeaders = {
  "content-type": "application/json",
  "x-kaspaflow-admin-token": adminToken,
};

const health = await getJson("/api/health");
assert(health.storageProvider === "postgres", "health must report postgres storage");
assert(health.storage?.ready === true, "postgres storage must be ready");

const admin = await getJson("/api/admin", true);
assert(admin.settings?.activeStoreId, "admin settings must include an active store");

const created = await postJson("/api/payments", {
  merchantName: "KaspaFlow Smoke Test",
  merchantAddress,
  fiatAmount: 1000,
  fiatCurrency: "KRW",
});
const paymentId = created.payment?.id;
assert(paymentId, "payment creation must return an id");

const simulated = await postJson(`/api/payments/${paymentId}/simulate`, {
  status: "confirmed",
});
assert(
  simulated.payment?.status === "confirmed",
  "simulation must return confirmed payment",
);
assert(simulated.payment?.simulated === true, "simulation flag must be true");

const analytics = await getJson("/api/analytics", true);
assert(
  Number(analytics.summary?.statusCounts?.confirmed ?? 0) >= 1,
  "analytics must include confirmed payments",
);

const audit = await getJson("/api/audit", true);
assert(
  Array.isArray(audit.events) &&
    audit.events.some((event) => event.paymentId === paymentId),
  "audit log must include the smoke payment",
);

console.log(`Postgres API smoke passed for ${paymentId}`);

async function getJson(path, authed = false) {
  return requestJson(path, {
    headers: authed ? adminHeaders : undefined,
  });
}

async function postJson(path, body) {
  return requestJson(path, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(body),
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
