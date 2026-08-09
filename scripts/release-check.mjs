import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = process.env.KASPAFLOW_DATA_DIR ?? path.join(root, "data");
const backupDir = process.env.KASPAFLOW_BACKUP_DIR ?? path.join(root, "backups");

const baseEnv = {
  ...process.env,
  NODE_ENV: "production",
  KASPAFLOW_ADMIN_TOKEN:
    process.env.KASPAFLOW_ADMIN_TOKEN ?? "dummy-production-token",
  KASPAFLOW_ENABLE_SIMULATION:
    process.env.KASPAFLOW_ENABLE_SIMULATION ?? "false",
  KASPA_NETWORK: process.env.KASPA_NETWORK ?? "mainnet",
  KASPA_WATCHER_MODE: process.env.KASPA_WATCHER_MODE ?? "kaspa-rest",
  KASPAFLOW_DATA_DIR: dataDir,
  KASPAFLOW_BACKUP_DIR: backupDir,
  KASPAFLOW_STORAGE_PROVIDER:
    process.env.KASPAFLOW_STORAGE_PROVIDER ?? "file",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "kaspaflow-dev",
};

if (baseEnv.KASPAFLOW_STORAGE_PROVIDER === "postgres") {
  baseEnv.DATABASE_URL =
    process.env.DATABASE_URL ??
    "postgres://kaspaflow:kaspaflow-dev@postgres:5432/kaspaflow";
}

mkdirSync(dataDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });

const steps = [
  ["Build", "npm", ["run", "build"], process.env],
  ["Typecheck", "npm", ["run", "typecheck"], process.env],
  ["Test", "npm", ["test"], process.env],
  ["Production preflight", "npm", ["run", "preflight:prod"], baseEnv],
  ["Audit production dependencies", "npm", ["audit", "--omit=dev"], process.env],
];

for (const [label, command, args, env] of steps) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`\nRelease check failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      storageProvider: baseEnv.KASPAFLOW_STORAGE_PROVIDER,
      dataDir,
      backupDir,
    },
    null,
    2,
  ),
);
