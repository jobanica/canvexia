"use client";

import { useEffect } from "react";

/**
 * The app had no error boundary at all, so any uncaught client-side exception
 * replaced the whole page with Next's bare "Application error: a client-side
 * exception has occurred" — no context, no way back, and nothing telling the
 * owner whether their data was safe.
 *
 * This turns that into something recoverable. "Try again" re-runs the failed
 * render, which is usually enough, and the way back to the dashboard is always
 * on screen so a single bad component never traps anyone.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this to the server log; a screenshot of the page
    // is otherwise unactionable when someone reports it.
    console.error("Unhandled UI error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-cream px-5 py-12">
      <div className="w-full max-w-md rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
        <div className="text-4xl">😕</div>
        <h1 className="mt-3 font-heading text-xl font-bold text-plum-ink">
          Something went wrong on this screen
        </h1>
        <p className="mt-2 text-sm text-plum-ink/60">
          Your data is safe — this is just the page. Try again, and if it keeps
          happening, tell us what you were doing.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={reset}
            className="w-full rounded-full py-3 font-heading text-sm font-bold btn-brand"
          >
            Try again
          </button>
          <a
            href="/admin"
            className="w-full rounded-full border border-plum-ink/15 py-3 text-sm font-semibold text-plum-ink/70"
          >
            Back to dashboard
          </a>
        </div>

        {error.digest && (
          <p className="mt-4 font-mono text-[11px] text-plum-ink/35">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
