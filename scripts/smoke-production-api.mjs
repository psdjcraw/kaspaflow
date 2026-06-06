#!/usr/bin/env node

const baseUrl = (process.env.KASPAFLOW_BASE_URL ?? "http://localhost:3000")
  .replace(/\/$/, "");
const adminToken = process.env.KASPAFLOW_ADMIN_TOKEN;
const expectedNetwork = process.env.KASPA_NETWORK ?? "mainnet";

if (!adminToken) {
  console.error("KASPAFLOW_ADMIN_TOKEN is required.");
  process.exit(1);
}

const adminHeaders = {
  "x-kaspaflow-admin-token": adminToken,
};

const results = [];

const health = await check("health", () => getJson("/api/health"));
assert(health.ok === true, "health must report ok=true");
assert(
  health.adminAuthEnabled === true,
  "health must report adminAuthEnabled=true",
);
assert(
  health.simulationEnabled === false,
  "health must report simulationEnabled=false",
);
assert(
  health.kaspaNetwork === expectedNetwork,
  `health must report kaspaNetwork=${expectedNetwork}`,
);
assert(
  health.watcherMode === "kaspa-rest",
  "health must report watcherMode=kaspa-rest",
);

const probe = await check("kaspaProbe", () => getJson("/api/kaspa/probe"));
assert(probe.ok === true, "kaspa probe must report ok=true");
assert(
  probe.network === expectedNetwork,
  `kaspa probe must report network=${expectedNetwork}`,
);

const admin = await check("adminAuth", () => getJson("/api/admin", true));
assert(
  admin.settings?.merchantAddress,
  "admin endpoint must return merchant settings",
);

const sync = await check("paymentSync", () =>
  postJson("/api/payments/sync?silent=1"),
);
assert(
  Number.isFinite(sync.summary?.checked),
  "payment sync must return a checked count",
);

console.log(JSON.stringify({
  ok: true,
  baseUrl,
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

async function postJson(path) {
  return requestJson(path, {
    method: "POST",
    headers: adminHeaders,
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
