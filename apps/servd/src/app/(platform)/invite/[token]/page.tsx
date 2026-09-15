import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_BLURB, ROLE_TITLE, inviteExpiryLabel } from "@servd/core";
import { CanvexiaLockup } from "@/components/partner/CanvexiaBrand";
import { AcceptInvite } from "@/components/partner/AcceptInvite";
import { findInvite, INVITE_MESSAGE } from "@/server/partners/accept-invite";

/**
 * Accepting a staff invitation.
 *
 * PUBLIC BY NECESSITY — the whole point is that the person has no login yet —
 * and the 24-byte token in the path is the only authority. It is not indexable
 * and must never be: `noindex` below, and nothing on the page echoes the token
 * anywhere a referrer could carry it.
 */
export const metadata: Metadata = {
  title: "Accept your invitation · CANVEXIA",
  robots: { index: false, follow: false },
};

/** Never prerendered: the token is the input, and the answer changes per row. */
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await findInvite(decodeURIComponent(token));

  if (!found.ok) {
    return (
      <div className="mx-auto max-w-sm px-6 py-16">
        <CanvexiaLockup size={30} />
        <h1 className="mt-8 font-heading text-2xl font-bold">This link doesn&rsquo;t work</h1>
        {/*
          FOUR DIFFERENT SENTENCES, not one "invalid link". Each of them tells
          the person what to do next, and they are genuinely different
          situations — see accept-invite.ts for why saying which is not a leak.
        */}
        <p className="mt-2 text-sm text-brand-ink/60">{INVITE_MESSAGE[found.problem]}</p>
        <p className="mt-6 text-sm text-brand-ink/50">
          Already have an account?{" "}
          <Link href="/partner/login" className="font-semibold text-brand-primary">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const invite = found.invite;
  const title = ROLE_TITLE[invite.role] ?? invite.role;

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <CanvexiaLockup size={30} />
      <h1 className="mt-8 font-heading text-2xl font-bold">
        Join {invite.partnerName}
      </h1>
      <p className="mt-2 text-sm text-brand-ink/60">
        You&rsquo;re invited as {/^[aeiou]/i.test(title) ? "an" : "a"}{" "}
        <strong className="font-semibold text-brand-ink">{title}</strong>.{" "}
        {ROLE_BLURB[invite.role] ?? ""}
      </p>
      <p className="mt-1 text-xs text-brand-ink/45">
        {invite.email} · link works until {inviteExpiryLabel(invite.expiresAt)}
      </p>
      <div className="mt-6">
        {/* The token goes back as a hidden field rather than being read from
            the URL in the action: the action is the thing that consumes it, and
            it should not depend on how the page was routed. */}
        <AcceptInvite token={decodeURIComponent(token)} email={invite.email} />
      </div>
    </div>
  );
}
