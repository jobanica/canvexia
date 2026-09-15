/**
 * The CANVEXIA mark and wordmark, drawn rather than loaded.
 *
 * SVG instead of a PNG for three reasons that matter on this page: it stays
 * sharp on a phone at any density, it recolours (the footer needs it on dark),
 * and it adds no binary to a repository that is public.
 *
 * APPROXIMATION. Redrawn from the supplied logo — four blocks pinwheeling
 * around a gap, three in ink and the upper-right one carrying the coral→ember
 * gradient. If the real vector differs, replace the paths here; nothing else
 * references the geometry.
 */

export function Mark({ size = 32, title }: { size?: number; title?: string }) {
  // A FIXED id, not a random one. Random ids differ between the server render
  // and the client render, which React reports as a hydration mismatch — and
  // the usual reason to randomise (two gradients colliding) does not apply
  // here: every mark declares the same gradient over the same 48×48 user
  // space, so a second mark resolving to the first one's definition gets an
  // identical gradient.
  const id = "cx-mark-accent";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={id} x1="26" y1="22" x2="46" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8536A" />
          <stop offset="1" stopColor="#F2894E" />
        </linearGradient>
      </defs>
      {/* upper-left, lower-left, lower-right: ink */}
      <path d="M2 8.5 8.5 2 22 15.5V22h-6.5L2 8.5Z" fill="#1A1A1E" />
      <path d="M2 39.5 8.5 46 22 32.5V26h-6.5L2 39.5Z" fill="#1A1A1E" />
      <path d="M46 39.5 39.5 46 26 32.5V26h6.5L46 39.5Z" fill="#1A1A1E" />
      {/* upper-right: the one place the gradient appears */}
      <path d={`M46 8.5 39.5 2 26 15.5V22h6.5L46 8.5Z`} fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * Mark plus name. `tone="light"` for the dark footer.
 *
 * The tagline is optional because it belongs under the logo on a footer and
 * nowhere near a sticky nav, where it would be unreadable at 11px.
 */
export function Wordmark({
  size = 28,
  tagline = false,
  tone = "dark",
}: {
  size?: number;
  tagline?: boolean;
  tone?: "dark" | "light";
}) {
  const text = tone === "dark" ? "text-ink" : "text-paper";
  const sub = tone === "dark" ? "text-ink-faint" : "text-paper/55";
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={size} title="CANVEXIA" />
      <span className="flex flex-col leading-none">
        <span
          className={`font-display font-bold tracking-[0.14em] ${text}`}
          style={{ fontSize: size * 0.66 }}
        >
          CANVEXIA
        </span>
        {tagline && (
          <span
            className={`mt-1.5 font-sans tracking-[0.22em] ${sub}`}
            style={{ fontSize: Math.max(8, size * 0.26) }}
          >
            TECHNOLOGY FOR LOCAL BUSINESSES
          </span>
        )}
      </span>
    </span>
  );
}
