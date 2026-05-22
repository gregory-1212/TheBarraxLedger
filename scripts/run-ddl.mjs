// Runs a single SQL migration file directly against the Supabase PostgreSQL database.
// Connects via raw Postgres (pg library), not the REST API, so it can execute DDL
// (CREATE TABLE, ALTER, CREATE FUNCTION, etc.) that the Supabase JS client can't do.
// Usage: node scripts/run-ddl.mjs <migration-file>
// Example: node scripts/run-ddl.mjs supabase/migrations/001_extensions.sql

import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = resolve(__dirname, "../.env.local");
const envText = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
}

const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
const projectRef = url.hostname.split(".")[0];

// Connect via the IPv4-reachable pooler. The direct host (db.<ref>.supabase.co)
// is IPv6-only and unreachable from Codespaces; the pooler accepts the same
// SUPABASE_DB_PASSWORD with `postgres.<ref>` as the username.
const client = new pg.Client({
  host: "aws-1-us-east-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: `postgres.${projectRef}`,
  password: env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node scripts/run-ddl.mjs <migration-file>");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "..", sqlFile);
const sql = readFileSync(sqlPath, "utf-8");

console.log(`Connecting to db.${projectRef}.supabase.co via pooler...`);
await client.connect();
console.log("Connected.\n");

try {
  console.log(`Running: ${sqlFile}`);
  await client.query(sql);
  console.log("\nMigration completed successfully.");
} catch (err) {
  console.error("\nMigration failed:", err.message);
  if (err.position) {
    const pos = parseInt(err.position);
    const snippet = sql.substring(Math.max(0, pos - 100), pos + 100);
    console.error("Near:", snippet);
  }
  process.exit(1);
} finally {
  await client.end();
}
