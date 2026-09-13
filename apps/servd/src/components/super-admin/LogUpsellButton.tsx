"use client";

import { useState } from "react";
import { logUpsellOffered } from "@/server/bizops/actions";

/**
 * Record that an offer was made.
 *
 * Writes an event, nothing more — this layer never messages a customer. The
 * value is that the next person to open that profile can see the offer already
 * went out, rather than making it twice in a week.
 */
export function LogUpsellButton({
  restaurantId,
  product,
}: {
  restaurantId: string;
  product: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  if (state === "done") {
    return <span className="shrink-0 text-xs font-semibold text-mango">✓ Logged as offered</span>;
  }

  return (
    <button
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        await logUpsellOffered(restaurantId, product).catch(() => {});
        setState("done");
      }}
      className="shrink-0 rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold hover:bg-white disabled:opacity-60"
    >
      {state === "busy" ? "Saving…" : "Log as offered"}
    </button>
  );
}
