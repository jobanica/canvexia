import { OUTCOME_LABELS } from "@/lib/partners/outcomes";

/**
 * The day's visits, with the photo that proves each one.
 *
 * WHY THE PHOTO CARRIES THE WEIGHT HERE. An operator has no addresses on file —
 * a salesperson walking into a carinderia nobody has heard of is how the
 * business gets discovered — so on a first visit there is nothing for GPS to be
 * checked against, and the map can only show where a phone claimed to be. The
 * photograph is the evidence; everything else on the card is context for it.
 *
 * A server component: the signed URLs are minted upstream and expire in ten
 * minutes, so there is nothing for a client to hold on to.
 */
export function VisitLog({
  visits,
}: {
  visits: {
    id: string;
    who: string;
    subjectName: string | null;
    outcome: string;
    notes: string | null;
    occurredAt: Date;
    flag: string;
    distanceMeters: number | null;
    photoUrl: string | null;
  }[];
}) {
  if (visits.length === 0) {
    return (
      <section className="rounded-tile border border-brand-ink/10 bg-white px-4 py-6 text-sm text-brand-ink/50">
        No visits logged on this day.
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-heading text-lg font-bold">
        Visits <span className="font-normal text-brand-ink/40">({visits.length})</span>
      </h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visits.map((v) => (
          <li
            key={v.id}
            className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white"
          >
            {v.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={v.photoUrl}
                alt={`Visit to ${v.subjectName ?? "a business"}`}
                className="h-44 w-full object-cover"
              />
            ) : (
              // Visits logged before the photo was required, and the rare
              // offline item whose photo was too large to queue. Said plainly
              // rather than shown as a broken image.
              <div className="flex h-44 w-full items-center justify-center bg-brand-surface text-xs text-brand-ink/40">
                No photo
              </div>
            )}
            <div className="p-3">
              <p className="text-sm font-semibold">{v.subjectName ?? "Unknown business"}</p>
              <p className="text-xs text-brand-ink/55">
                {v.who} ·{" "}
                {new Date(v.occurredAt).toLocaleTimeString("en-PH", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "Asia/Manila",
                })}
              </p>
              <p className="mt-1 text-xs font-semibold text-brand-ink/70">
                {OUTCOME_LABELS[v.outcome] ?? v.outcome}
              </p>
              {v.notes && (
                <p className="mt-1 line-clamp-3 text-xs text-brand-ink/55">{v.notes}</p>
              )}
              {/*
                Said honestly. `no_address` is the normal case for an operator
                who has not been collecting addresses, and dressing it up as a
                verification failure would be wrong.
              */}
              <p className="mt-1.5 text-[0.68rem] text-brand-ink/40">
                {v.flag === "ok" && v.distanceMeters !== null
                  ? `${Math.round(v.distanceMeters)} m from where this business was last seen`
                  : v.flag === "far" && v.distanceMeters !== null
                    ? `${Math.round(v.distanceMeters)} m away — further than expected`
                    : v.flag === "no_location"
                      ? "No location from the phone"
                      : "First visit here — nothing to compare the location to yet"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
