// Applies prisma/rls.sql to the database. Run after `prisma db push`/`migrate`.
// Uses DIRECT_URL (non-pooled) because we run DDL + multi-statement DO blocks.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

// Load env from .env / .env.local (node doesn't do this automatically).
for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file may not exist — ignore */
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "..", "prisma", "rls.sql"), "utf8");

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DIRECT_URL (or DATABASE_URL) before running db:rls.");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(sql); // pg allows multiple statements in one query
  console.log("✅ RLS policies applied.");
} catch (err) {
  console.error("❌ Failed to apply RLS:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
