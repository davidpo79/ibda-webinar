import postgres from "postgres";

// Schema migration runs once at container boot (scripts/migrate.mjs, invoked
// from scripts/start.mjs) — by the time any request handler runs, the schema
// is already guaranteed to exist.
let _sql: postgres.Sql | undefined;

export function sql(): postgres.Sql {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    _sql = postgres(url, { max: 5 });
  }
  return _sql;
}
