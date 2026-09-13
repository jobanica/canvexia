"use client";

/** Small online/offline indicator with a pending-sync count. */
export function ConnectivityPill({ online, pending }: { online: boolean; pending: number }) {
  if (online && pending === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-mango/15 px-2.5 py-1 text-xs font-semibold text-mango">
        <span className="h-2 w-2 rounded-full bg-mango" /> Online
      </span>
    );
  }
  if (online && pending > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-semibold text-brand-primary">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-primary" /> Syncing {pending}…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-guava/15 px-2.5 py-1 text-xs font-semibold text-guava">
      <span className="h-2 w-2 rounded-full bg-guava" /> Offline{pending > 0 ? ` · ${pending} pending` : ""}
    </span>
  );
}
