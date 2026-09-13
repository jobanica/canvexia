"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/(platform)/login/actions";

/**
 * Sign out of the merchant screen.
 *
 * Deliberately a two-tap confirm rather than a one-tap button. This screen is a
 * kiosk — it sits open on a tablet by the till all service, and the whole point
 * of it is the new-order alarm. A mis-tap that silently signs the shop out
 * means orders arrive and nobody hears them, which is the worst failure this
 * app has. Asking once costs a second and removes that entirely.
 *
 * The confirm times out on its own, so a stray tap doesn't leave "Sure?" armed
 * for the rest of the night waiting for a second stray tap to land on it.
 */
export function SignOutButton({ dark = false }: { dark?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!confirming) return;
    timer.current = setTimeout(() => setConfirming(false), 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [confirming]);

  const base = "rounded-full px-3 py-1.5 text-xs font-semibold transition";
  const idle = dark
    ? "text-white/60 hover:bg-white/10 hover:text-white"
    : "text-plum-ink/50 hover:bg-plum-ink/5 hover:text-plum-ink";

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${base} ${idle}`}>
        Sign out
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <form action={signOut}>
        <button className={`${base} bg-red-600 text-white hover:bg-red-700`}>
          Sign out?
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className={`${base} ${idle}`}
        aria-label="Cancel signing out"
      >
        Cancel
      </button>
    </span>
  );
}
