"use client";

import { useOnline } from "@/lib/useOnline";

/**
 * SAYS THE ONE THING AN INSTALLED APP HIDES.
 *
 * Making this installable is what created the need for it. In a browser tab a
 * cashier can see the connection has gone; in a standalone window there is no
 * address bar, no reload spinner and no dinosaur — the app looks exactly as it
 * did a minute ago, and the first sign of trouble is a Complete button that
 * hangs with a customer waiting.
 *
 * What Resceta CANNOT do offline is the thing it exists to do. A sale allocates
 * stock from specific batches by expiry and mints a gapless receipt number;
 * neither can be done from a cached page, and a queued sale would be a promise
 * about stock nobody can keep. So the honest move is to say so up front rather
 * than to build a queue that pretends.
 *
 * Reading still works — the dashboard, the catalogue and a receipt already
 * opened are served from the cache — which is why this says what stops rather
 * than "you are offline".
 */
export function OfflineNotice() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-500/15 px-6 py-2 text-center text-sm font-medium text-amber-200"
    >
      No connection. You can still look things up, but a sale cannot be completed until this
      comes back.
    </div>
  );
}
