import Link from "next/link";
import { Mark } from "@servd/ui";
import type { CurrentPartner } from "@/server/partners/auth";

/**
 * WHOSE PORTAL THIS IS, in the corner of every screen.
 *
 * REPORTED, alongside the colours — "also the LOGO and partner business name."
 * The corner read CANVEXIA on every partner's portal, whatever they had
 * uploaded. An operator with their own logo and their own trading name saw
 * neither, anywhere, ever.
 *
 * THE FALLBACK IS THE POINT. A partner who has set nothing still gets
 * CANVEXIA's mark and wordmark, exactly as before — this only replaces it once
 * there is something to replace it with. A half-branded portal showing a blank
 * space where a logo should be is worse than one that never claimed to be
 * theirs.
 *
 * ORDER: an uploaded logo wins, because it is the thing they went to the
 * trouble of making; then their trading name; then CANVEXIA. The logo renders
 * with `object-contain` inside a fixed height, so a tall or a very wide file
 * fits the bar rather than stretching it.
 */
export function PartnerLockup({
  partner,
  size = "sm",
}: {
  partner: CurrentPartner;
  /** `md` for the desktop sidebar, `sm` for the top bar and the drawer. */
  size?: "sm" | "md";
}) {
  const md = size === "md";
  const name = partner.brand.displayName?.trim() || null;

  return (
    <Link
      href="/partner"
      className={`flex min-w-0 items-center gap-2.5 ${md ? "px-2" : ""}`}
      aria-label={`${name ?? partner.name} — portal home`}
    >
      {partner.brand.logoUrl ? (
        /*
          eslint-disable-next-line @next/next/no-img-element — the host is a
          partner's own choice (Supabase storage, or a URL they pasted), so it
          cannot be in next.config's remotePatterns and next/image would refuse
          it at runtime on a screen that has to render.
        */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={partner.brand.logoUrl}
          alt={name ?? partner.name}
          className={`w-auto max-w-[170px] object-contain ${md ? "h-8" : "h-7"}`}
        />
      ) : name ? (
        // Their name, in the wordmark's shape but not its letterspacing: a
        // trading name is read, not recognised as a logotype.
        <span
          className={`truncate font-heading font-bold text-brand-ink ${md ? "text-base" : "text-sm"}`}
        >
          {name}
        </span>
      ) : (
        <>
          <Mark size={md ? 26 : 24} title="CANVEXIA" />
          <span className="font-bold tracking-[0.12em] text-brand-ink">CANVEXIA</span>
        </>
      )}
    </Link>
  );
}
