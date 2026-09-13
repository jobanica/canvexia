/**
 * The item photo on a cart line.
 *
 * A cart of five text rows all reading "₱180" is hard to scan; the photo is
 * how a diner confirms at a glance that they ordered the right thing before
 * they pay.
 *
 * Fixed square with a placeholder when there's no photo, so the rows stay
 * aligned whether or not the restaurant has uploaded pictures — a list that
 * indents only some of its rows looks broken.
 */
export function CartThumb({
  src,
  alt = "",
  size = 48,
}: {
  src?: string | null;
  alt?: string;
  size?: number;
}) {
  const box = { width: size, height: size };

  if (!src) {
    return (
      <div
        aria-hidden="true"
        style={box}
        className="flex shrink-0 items-center justify-center rounded-lg bg-plum-ink/5 text-base"
      >
        🍽️
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={box}
      className="shrink-0 rounded-lg border border-plum-ink/10 object-cover"
    />
  );
}
