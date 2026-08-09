import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_MERCHANT_ADDRESS =
  "kaspa:q000000000000000000000000000000000000000000000000000000000000";
const PLACEHOLDER_ADMIN_TOKENS = new Set([
  "replace-with-strong-random-token",
  "changeme",
  "change-me",
  "dummy",
  "test",
]);

const checks = [
  check("nodeEnvProduction", process.env.NODE_ENV === "production", {
    expected: "NODE_ENV=production",
    actual: process.env.NODE_ENV ?? null,
  }),
  check("adminTokenConfigured", Boolean(process.env.KASPAFLOW_ADMIN_TOKEN), {
    expected: "KASPAFLOW_ADMIN_TOKEN is set",
  }),
  check("adminTokenStrong", isStrongAdminToken(process.env.KASPAFLOW_ADMIN_TOKEN), {
    expected: "KASPAFLOW_ADMIN_TOKEN is not a placeholder and is at least 32 characters",
    actual: process.env.KASPAFLOW_ADMIN_TOKEN
      ? `${process.env.KASPAFLOW_ADMIN_TOKEN.length} characters`
      : null,
  }),
  check(
    "simulationDisabled",
    process.env.KASPAFLOW_ENABLE_SIMULATION !== "true",
    {
      expected: "KASPAFLOW_ENABLE_SIMULATION is not true",
      actual: process.env.KASPAFLOW_ENABLE_SIMULATION ?? null,
    },
  ),
  check("mainnet", (process.env.KASPA_NETWORK ?? "mainnet") === "mainnet", {
    expected: "KASPA_NETWORK=mainnet",
    actual: process.env.KASPA_NETWORK ?? "mainnet",
  }),
  check("kaspaRestWatcher", process.env.KASPA_WATCHER_MODE === "kaspa-rest", {
    expected: "KASPA_WATCHER_MODE=kaspa-rest",
    actual: process.env.KASPA_WATCHER_MODE ?? null,
  }),
  ...storageChecks(),
  ...notificationChecks(),
];

const failed = checks.filter((entry) => !entry.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  checkedAt: new Date().toISOString(),
  checks,
}, null, 2));

if (failed.length) {
  process.exit(1);
}

function storageChecks() {
  const provider = process.env.KASPAFLOW_STORAGE_PROVIDER === "postgres"
    ? "postgres"
    : "file";
  const dataDir = path.resolve(
    process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data"),
  );
  const backupDir = path.resolve(
    process.env.KASPAFLOW_BACKUP_DIR ?? path.join(process.cwd(), "backups"),
  );

  if (provider === "postgres") {
    return [
      check("storageProvider", true, { actual: provider }),
      check("databaseUrlConfigured", Boolean(process.env.DATABASE_URL), {
        expected: "DATABASE_URL is set for postgres storage",
      }),
      check("backupDirConfigured", Boolean(process.env.KASPAFLOW_BACKUP_DIR), {
        expected: "KASPAFLOW_BACKUP_DIR is set",
        actual: process.env.KASPAFLOW_BACKUP_DIR ?? null,
      }),
    ];
  }

  return [
    check("storageProvider", true, { actual: provider }),
    check("dataDirExists", isDirectory(dataDir), {
      expected: "KASPAFLOW_DATA_DIR points to an existing directory",
      actual: dataDir,
    }),
    check("merchantAddressConfigured", hasConfiguredMerchantAddress(dataDir), {
      expected: "merchant-settings.json exists and does not use the built-in placeholder address",
      actual: getMerchantSettingsPath(dataDir),
    }),
    check("backupDirConfigured", Boolean(process.env.KASPAFLOW_BACKUP_DIR), {
      expected: "KASPAFLOW_BACKUP_DIR is set",
      actual: process.env.KASPAFLOW_BACKUP_DIR ?? null,
    }),
    check("backupDirExists", isDirectory(backupDir), {
      expected: "KASPAFLOW_BACKUP_DIR points to an existing directory",
      actual: backupDir,
    }),
  ];
}

function notificationChecks() {
  const format = process.env.KASPAFLOW_NOTIFY_WEBHOOK_FORMAT ?? "json";

  return [
    check(
      "notificationFormat",
      ["json", "discord", "telegram"].includes(format),
      {
        expected: "json, discord, or telegram",
        actual: format,
      },
    ),
    check(
      "telegramChatId",
      format !== "telegram" || Boolean(process.env.KASPAFLOW_NOTIFY_TELEGRAM_CHAT_ID),
      {
        expected: "KASPAFLOW_NOTIFY_TELEGRAM_CHAT_ID is set for telegram format",
      },
    ),
  ];
}

function check(name, ok, details = {}) {
  return {
    name,
    ok,
    ...details,
  };
}

function isDirectory(value) {
  return existsSync(value) && statSync(value).isDirectory();
}

function isStrongAdminToken(value) {
  if (!value) {
    return false;
  }

  return value.length >= 32 && !PLACEHOLDER_ADMIN_TOKENS.has(value.toLowerCase());
}

function getMerchantSettingsPath(dataDir) {
  return path.join(dataDir, "merchant-settings.json");
}

function hasConfiguredMerchantAddress(dataDir) {
  const settingsPath = getMerchantSettingsPath(dataDir);

  if (!existsSync(settingsPath)) {
    return false;
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const address = String(settings.merchantAddress ?? "").trim().toLowerCase();

    return Boolean(address) && address !== DEFAULT_MERCHANT_ADDRESS;
  } catch {
    return false;
  }
}
