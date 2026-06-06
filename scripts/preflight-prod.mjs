import { existsSync, statSync } from "node:fs";
import path from "node:path";

const checks = [
  check("nodeEnvProduction", process.env.NODE_ENV === "production", {
    expected: "NODE_ENV=production",
    actual: process.env.NODE_ENV ?? null,
  }),
  check("adminTokenConfigured", Boolean(process.env.KASPAFLOW_ADMIN_TOKEN), {
    expected: "KASPAFLOW_ADMIN_TOKEN is set",
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
