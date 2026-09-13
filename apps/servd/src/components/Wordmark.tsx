/**
 * The Servd wordmark: lowercase "servd" in Outfit ExtraBold, where the missing
 * "e" between v and d is a small gradient-filled dot near the baseline.
 *
 * Rendered as: serv + <dot> + d. The dot uses var(--brand-gradient); on the
 * platform chrome that's the Servd gradient. (Don't use this on diner pages —
 * those carry the restaurant's own logo/name, not the Servd wordmark.)
 */
export function Wordmark({
  className = "",
  size = "1.5rem",
}: {
  className?: string;
  size?: string;
}) {
  return (
    <span
      className={`wordmark ${className}`}
      style={{ fontSize: size }}
      aria-label="servd"
    >
      serv
      <span className="wordmark-dot" aria-hidden="true" />
      d
    </span>
  );
}

/** The app icon tile (rounded gradient square + white "s" + dot). */
export function AppIcon({ size = 40 }: { size?: number }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/brand/servd-icon.svg"
      alt="Servd"
      width={size}
      height={size}
      style={{ borderRadius: size * 0.22 }}
    />
  );
}
