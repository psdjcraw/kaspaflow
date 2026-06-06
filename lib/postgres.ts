import "server-only";

import { Pool, type QueryResultRow } from "pg";

declare global {
  var kaspaflowPgPool: Pool | undefined;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres storage.");
  }

  return databaseUrl;
}

export function getPostgresPool() {
  if (!globalThis.kaspaflowPgPool) {
    globalThis.kaspaflowPgPool = new Pool({
      connectionString: getDatabaseUrl(),
    });
  }

  return globalThis.kaspaflowPgPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getPostgresPool().query<T>(text, values);
}
