/**
 * A schematic of a product screen, not a screenshot.
 *
 * The brief asks for real screenshots with the brand swapped for "YourBrand".
 * There are none in this repository, and a convincing fake — invented orders,
 * invented totals, invented merchant names — is exactly what the copy rules
 * forbid on a page written for people who have been pitched at before.
 *
 * So this is deliberately abstract: a browser chrome, a brand bar carrying
 * whatever name is passed in, and blank content blocks with no data in them. It
 * makes the white-label point (the partner's name is at the top, not ours) and
 * claims nothing. Replace it with real captures when they exist; nothing else
 * depends on this file.
 */
export function ScreenFrame({
  brand = "YourBrand",
  label,
  className = "",
}: {
  brand?: string;
  /** Omit it when the caption belongs to a CLUSTER of frames rather than one. */
  label?: string;
  className?: string;
}) {
  return (
    <figure className={`overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_0_rgba(26,26,30,0.04),0_12px_40px_-24px_rgba(26,26,30,0.35)] ${className}`}>
      {/* chrome */}
      <div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2.5">
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="ml-2 truncate text-[0.62rem] font-medium tracking-wide text-ink-faint">
          {brand.toLowerCase().replace(/\s+/g, "")}.ph
        </span>
      </div>

      {/* the white-label point: the partner's name sits where ours would */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-display text-sm font-bold tracking-[0.08em] text-ink">
          {brand.toUpperCase()}
        </span>
        <span className="h-5 w-5 rounded-full bg-ink/[0.07]" />
      </div>

      <div className="space-y-3 p-4" aria-hidden="true">
        <div className="h-2.5 w-1/3 rounded bg-ink/[0.10]" />
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="aspect-[4/3] rounded-md bg-ink/[0.05] ring-1 ring-inset ring-line" />
          ))}
        </div>
        <div className="h-2.5 w-2/3 rounded bg-ink/[0.08]" />
        <div className="h-9 w-full rounded-md bg-ink/[0.9]" />
      </div>

      {label && (
        <figcaption className="border-t border-line px-4 py-2.5 text-[0.7rem] text-ink-faint">
          {label}
        </figcaption>
      )}
    </figure>
  );
}
