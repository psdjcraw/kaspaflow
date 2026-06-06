import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(
  process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data"),
);
const backupDir = path.resolve(
  process.env.KASPAFLOW_BACKUP_DIR ?? path.join(process.cwd(), "backups"),
);

if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) {
  console.error(`Data directory not found: ${dataDir}`);
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });

const timestamp = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replace(/\.\d{3}Z$/, "Z");
const backupPath = path.join(backupDir, `kaspaflow-data-${timestamp}.tgz`);
const dataParent = path.dirname(dataDir);
const dataBaseName = path.basename(dataDir);

const result = spawnSync(
  "tar",
  ["-czf", backupPath, "-C", dataParent, dataBaseName],
  {
    encoding: "utf8",
    stdio: "pipe",
  },
);

if (result.status !== 0) {
  console.error(result.stderr || "Failed to create backup archive.");
  process.exit(result.status ?? 1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      dataDir,
      backupPath,
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
