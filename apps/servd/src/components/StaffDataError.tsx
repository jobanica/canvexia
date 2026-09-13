/**
 * Friendly fallback for staff screens when a data query fails (instead of a
 * white "Application error" page). Surfaces the real message so it's diagnosable
 * — most often a production schema that hasn't had `npm run db:setup` run yet.
 */
export function StaffDataError({ title, message }: { title: string; message: string }) {
  const schemaHint = /column .* does not exist|relation .* does not exist|app_user/i.test(message);
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div className="rounded-tile border border-guava/30 bg-white p-6">
        <h1 className="font-heading text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-plum-ink/70">
          We couldn&apos;t load this screen. The technical detail is below.
        </p>
        {schemaHint && (
          <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm text-plum-ink/70">
            This usually means the database is missing recent updates. Run{" "}
            <code>npm run db:setup</code> against the production database, then reload.
          </p>
        )}
        <pre className="mt-3 overflow-x-auto rounded-lg bg-plum-ink/5 p-3 text-xs text-plum-ink/60">
          {message}
        </pre>
      </div>
    </div>
  );
}
