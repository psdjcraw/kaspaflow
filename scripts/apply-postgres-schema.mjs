#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const schemaFile = process.argv[2] ?? path.join(process.cwd(), "db", "schema.sql");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const schemaSql = readFileSync(schemaFile, "utf8");
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(schemaSql);
  console.log(`Applied ${schemaFile}`);
} finally {
  await client.end();
}
