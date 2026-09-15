/**
 * The CANVEXIA console vocabulary: stat cards, the two mini-visuals, an avatar.
 *
 * EXTRACTED, not written twice. These were inside components/partner/Overview.tsx
 * and the HQ console needs exactly the same four-card rhythm — same colours,
 * same shadow, same tabular numerals. Copying them would have produced two sets
 * that drift, and the first symptom of that is two screens in one product that
 * do not look like one product.
 *
 * What is NOT here is anything that knows about a partner or about HQ. These
 * take strings and numbers. The screens decide what the numbers mean.
 */

/** "₱20,979" from centavos. Whole pesos — a dashboard is not a receipt. */
export function peso(centavos: number): string {
  return `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;
}

/**
 * THE FOUR COLOURS ARE ALL CANVEXIA'S. The dashboard layout these follow uses
 * blue, purple, red and green — four unrelated hues that would make the screen
 * belong to a different company. These are ink, coral, ember and the one
 * gradient, which keeps the four-card rhythm without importing a palette.
 */
export type CardTone = "ink" | "coral" | "ember" | "gradient";

export const TONE: Record<CardTone, { band: string; bar: string }> = {
  ink: { band: "bg-brand-ink text-white", bar: "bg-brand-ink" },
  coral: { band: "bg-brand-primary text-white", bar: "bg-brand-primary" },
  ember: { band: "bg-brand-accent text-white", bar: "bg-brand-accent" },
  gradient: {
    band: "text-white [background-image:linear-gradient(115deg,var(--brand-primary),var(--brand-accent))]",
    bar: "[background-image:linear-gradient(115deg,var(--brand-primary),var(--brand-accent))]",
  },
};

/** A five-bar sparkline. `fill` is how many bars are solid. */
export function Bars({ fill, className }: { fill: number; className: string }) {
  const heights = [10, 16, 22, 14, 19];
  return (
    <span aria-hidden="true" className="flex items-end gap-1">
      {heights.map((h, i) => (
        <span
          key={i}
          style={{ height: h }}
          className={`w-1.5 rounded-full ${i < fill ? className : "bg-brand-ink/10"}`}
        />
      ))}
    </span>
  );
}

/** A donut, drawn as one SVG circle with a dash offset. */
export function Donut({ pct, className }: { pct: number; className: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" className="stroke-brand-ink/10" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))}
        transform="rotate(-90 20 20)"
        className={className}
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  note,
  tone,
  visual,
}: {
  label: string;
  value: string;
  /**
   * What the number IS, not how it changed.
   *
   * The reference layout puts "+11%" on every card. Neither console has the
   * history to compare against on every figure, and inventing a percentage is
   * the thing canvexia.com was written not to do. Where a real month-on-month
   * figure exists, the SCREEN passes it in here; where it does not, this says
   * what is being counted instead.
   */
  note: string;
  tone: CardTone;
  visual: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white shadow-[0_1px_0_rgba(26,26,30,0.03),0_14px_30px_-26px_rgba(26,26,30,0.4)]">
      <div className={`px-5 py-4 ${TONE[tone].band}`}>
        <p className="font-heading text-lg font-bold leading-tight">{label}</p>
      </div>
      <div className="flex items-center gap-4 px-5 py-5">
        <span className="shrink-0">{visual}</span>
        <span className="min-w-0">
          <span className="block font-heading text-2xl font-bold leading-none tabular-nums">
            {value}
          </span>
          <span className="mt-1 block text-xs text-brand-ink/50">{note}</span>
        </span>
      </div>
    </div>
  );
}

/** Initials in a tinted circle — no photo is stored anywhere in this system. */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-[0.7rem] font-bold text-brand-primary"
    >
      {initials || "?"}
    </span>
  );
}

/**
 * Month-on-month, as a signed percentage — or null when there is nothing to
 * compare against.
 *
 * Null rather than 0 for a previous month of zero: "up 0%" and "there was
 * nothing here last month" are different statements, and on a database this
 * young the second one is almost always the true one. The card renders the
 * difference.
 */
export function momPct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** "+18% vs last month", "−4% vs last month", or the fallback when unknowable. */
export function momNote(pct: number | null, fallback: string): string {
  if (pct === null) return fallback;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct)}% vs last month`;
}
