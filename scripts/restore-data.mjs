import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const force = args.includes("--force");
const archiveArg = args.find((arg) => !arg.startsWith("--")) ??
  process.env.KASPAFLOW_RESTORE_ARCHIVE;
const dataDir = path.resolve(
  process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data"),
);

if (!archiveArg) {
  console.error("Usage: npm run restore:data -- <backup.tgz> [--force]");
  process.exit(1);
}

const archivePath = path.resolve(archiveArg);

if (!existsSync(archivePath) || !statSync(archivePath).isFile()) {
  console.error(`Backup archive not found: ${archivePath}`);
  process.exit(1);
}

if (existsSync(dataDir) && readdirSync(dataDir).length > 0 && !force) {
  console.error(
    `Refusing to restore over non-empty data directory: ${dataDir}\n` +
      "Re-run with --force to move the current directory aside first.",
  );
  process.exit(1);
}

const restoreTempDir = mkdtempSync(path.join(os.tmpdir(), "kaspaflow-restore-"));
const extractedDir = path.join(restoreTempDir, "data");

try {
  const result = spawnSync("tar", ["-xzf", archivePath, "-C", restoreTempDir], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to extract backup archive.");
  }

  if (!existsSync(extractedDir) || !statSync(extractedDir).isDirectory()) {
    throw new Error("Backup archive does not contain a data directory.");
  }

  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
  const previousDataDir = `${dataDir}.pre-restore-${timestamp}`;

  if (existsSync(dataDir)) {
    renameSync(dataDir, previousDataDir);
  }

  renameSync(extractedDir, dataDir);

  console.log(
    JSON.stringify(
      {
        ok: true,
        archivePath,
        dataDir,
        previousDataDir: existsSync(previousDataDir) ? previousDataDir : null,
        restoredAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Restore failed.");
  process.exitCode = 1;
} finally {
  rmSync(restoreTempDir, { recursive: true, force: true });
}
