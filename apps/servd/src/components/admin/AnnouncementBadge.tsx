"use client";

/**
 * The unread count on the Announcements button.
 *
 * It has to be noticed by somebody who isn't looking for it — an owner opens
 * the dashboard to check today's sales, not to read notices. So the number
 * doesn't just sit there: a ping ring expands out of it on a loop, which
 * catches peripheral vision the way a static red dot doesn't.
 *
 * The ring is a SEPARATE absolutely-positioned span rather than an animation on
 * the number itself, so the digits stay still and readable while the halo moves.
 * A pulsing number is harder to read, not easier to notice.
 */
export function AnnouncementBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="relative ml-auto flex h-5 min-w-[1.25rem] items-center justify-center">
      {/* The halo. aria-hidden: it's decoration, and a screen reader announcing
          it would just repeat the number. */}
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-guava opacity-70"
        aria-hidden
      />
      <span className="relative inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-guava px-1.5 text-[11px] font-bold text-white">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
