// Plain Node (no TS/Vite pipeline) so it can run before the built server
// bundle is imported. Idempotent — db/schema.sql only ever adds
// tables/indexes/seed rows (CREATE ... IF NOT EXISTS, ON CONFLICT DO NOTHING).
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL not set — skipping schema migration");
    return;
  }
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  const sql = postgres(url, { max: 1 });
  try {
    await sql.unsafe(schema);
    console.log("[migrate] schema up to date");
  } finally {
    await sql.end();
  }
}
