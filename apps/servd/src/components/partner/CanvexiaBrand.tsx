import { Mark } from "@servd/ui";

/**
 * CANVEXIA's lockup, as the partner portal wears it.
 *
 * The mark comes from `packages/ui` — the same file canvexia.com draws — so the
 * logo a partner saw on the page that recruited them is byte-for-byte the logo
 * they see after signing in. The wordmark is spelled out here rather than
 * reusing packages/ui's because that one is built for a light page with its own
 * type scale, and this sits in a different app's chrome.
 */
export function CanvexiaLockup({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={size} title="CANVEXIA" />
      <span
        className="font-bold tracking-[0.14em] text-brand-ink"
        style={{ fontSize: size * 0.62 }}
      >
        CANVEXIA
      </span>
    </span>
  );
}
