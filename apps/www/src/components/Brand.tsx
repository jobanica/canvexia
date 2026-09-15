/**
 * The CANVEXIA mark and wordmark, drawn rather than loaded.
 *
 * SVG instead of a PNG for three reasons that matter on this page: it stays
 * sharp on a phone at any density, it recolours (the footer needs it on dark),
 * and it adds no binary to a repository that is public.
 *
 * REDRAWN, not traced. Four thick bands pinwheeling around a small square
 * gap, each running diagonally out from the centre and ending in a right-angle
 * notch that points back at it; three in ink, the upper-right one carrying the
 * coral→ember gradient. The geometry is 4-fold rotationally symmetric, so the
 * three ink paths are the first one mirrored in x, in y, and in both — change
 * one and you must change all four.
 *
 * This is drawn rather than linked because the supplied logo is a raster on the
 * founder's desktop and cannot be written into this repository from here. SVG
 * also stays sharp at any density, recolours for the dark footer, and adds no
 * binary to a public repo. If you drop the real vector in, replace the four `d`
 * attributes below; nothing else references the geometry.
 */

/** The upper-left band. The other three are this one, mirrored. */
const BAND = {
  topLeft: "M10 16.5 16.5 10 22 15.5V22h-6.5L10 16.5Z",
  bottomLeft: "M10 31.5 16.5 38 22 32.5V26h-6.5L10 31.5Z",
  bottomRight: "M38 31.5 31.5 38 26 32.5V26h6.5L38 31.5Z",
  topRight: "M38 16.5 31.5 10 26 15.5V22h6.5L38 16.5Z",
};

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
        <linearGradient id={id} x1="26" y1="22" x2="38" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8536A" />
          <stop offset="1" stopColor="#F2894E" />
        </linearGradient>
      </defs>
      <path d={BAND.topLeft} fill="#1A1A1E" />
      <path d={BAND.bottomLeft} fill="#1A1A1E" />
      <path d={BAND.bottomRight} fill="#1A1A1E" />
      {/* The one place the gradient appears. */}
      <path d={BAND.topRight} fill={`url(#${id})`} />
    </svg>
  );
}

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
