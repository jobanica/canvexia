/**
 * Turn a raw database error into something the person reading it can act on.
 *
 * Schema changes land here as idempotent files in prisma/manual that somebody
 * runs by hand, so there is always a window where the code knows about a column
 * the live database doesn't have yet. What surfaces in that window is a Prisma
 * string — "The column `qrGrandfathered` does not exist in the current
 * database" — which is true, useless, and looks like the app is broken. The fix
 * is always the same one thing, so say which file rather than making somebody
 * go and ask.
 */

/** The Postgres/Prisma shapes that mean "this database is behind the code". */
const MISSING_SCHEMA =
  /column .* does not exist|relation .* does not exist|does not exist in the current database/i;

export function isMissingSchemaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return MISSING_SCHEMA.test(msg);
}

/**
 * @param sqlFile bare filename inside prisma/manual, e.g. "add-qr-grandfather.sql"
 * @param fallback shown when the error is an ordinary failure, not a missing column
 */
export function migrationHint(e: unknown, sqlFile: string, fallback?: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (isMissingSchemaError(e)) {
    // The raw text is kept, trimmed, because it names the actual column — which
    // is the one detail that says whether the right file is being run.
    return `This database is missing a column. Run prisma/manual/${sqlFile} in the Supabase SQL editor, then try again. (${msg.slice(0, 120)})`;
  }
  return fallback || msg || "Something went wrong.";
}
