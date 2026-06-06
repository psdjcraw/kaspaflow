import "server-only";

export type StorageProvider = "file" | "postgres";

export function getStorageProvider(): StorageProvider {
  return process.env.KASPAFLOW_STORAGE_PROVIDER === "postgres"
    ? "postgres"
    : "file";
}

export function getStorageStatus() {
  const provider = getStorageProvider();
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
  const postgresReady = provider === "postgres" && databaseUrlConfigured;

  return {
    provider,
    databaseUrlConfigured,
    supported: provider === "file" || databaseUrlConfigured,
    ready: provider === "file" || postgresReady,
    note: provider === "file"
      ? "File-backed pilot storage is active."
      : postgresReady
        ? "Postgres storage is active."
        : "Postgres storage needs DATABASE_URL before use.",
  };
}

export function assertFileStorageProvider(storeName: string) {
  const provider = getStorageProvider();

  if (provider !== "file") {
    throw new Error(
      `${storeName} is still file-backed. Set KASPAFLOW_STORAGE_PROVIDER=file or implement the Postgres adapter before using ${provider}.`,
    );
  }
}
