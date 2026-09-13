import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { renderAccountEmail } from "@/lib/email/render";
import { getEmailCreds, sendBatch } from "./provider";

/**
 * ACCOUNT emails — the ones a customer needs whether or not they want
 * marketing from us.
 *
 * Two things separate these from campaigns, and both are deliberate:
 *
 *  • `emailOptOut` is NOT checked. Someone who unsubscribed from marketing
 *    still has to be able to get into the account they just paid for.
 *  • No unsubscribe footer. These aren't marketing, and offering to stop
 *    sending them would be offering to strand the customer.
 *
 * Every send here is best-effort: a mail failure must never roll back an
 * activation or a password change that already succeeded.
 */

async function send(to: string, subject: string, paragraphs: string[]): Promise<boolean> {
  const creds = await getEmailCreds();
  if (!creds || !to) return false;
  const { text, html } = renderAccountEmail(paragraphs);
  const [outcome] = await sendBatch(creds, [{ to, subject, text, html }]);
  return !!outcome?.ok;
}

/**
 * Sent the moment a payment is confirmed. Carries the username and the
 * one-time link to set a password.
 *
 * Note what it does NOT carry: the password. Activation creates the login with
 * a random secret nobody ever sees, and the owner chooses their own through
 * this link — so there is no password in the database to email, which is the
 * point. Mailing one would put a working credential in an inbox forever.
 */
export async function sendActivationEmail(restaurantId: string): Promise<boolean> {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          contactEmail: true,
          claimToken: true,
          claimedAt: true,
          staff: {
            where: { role: "admin" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { username: true },
          },
        },
      }),
    );
    const to = r?.contactEmail?.trim();
    const username = r?.staff[0]?.username;
    if (!r || !to || !username) return false;

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const claimUrl = r.claimToken && !r.claimedAt ? `${base}/claim/${r.claimToken}` : null;

    const paragraphs = [
      `${r.name} is live 🎉`,
      "Your payment went through and your ordering system is yours for good — one payment, no monthly fees.",
      `Your username is: ${username}`,
      claimUrl
        ? `Set your password here, then you're in: ${claimUrl}`
        : `You've already set your password — sign in at ${base}/login`,
      claimUrl ? "That link works once, so finish it in one go." : "",
      "Keep this email — it has the username you'll sign in with.",
    ].filter(Boolean);

    return await send(to, `${r.name} is live — set your password`, paragraphs);
  } catch {
    return false;
  }
}

/**
 * Sent once the owner has chosen their password, so they have a record of the
 * username they signed up with and a link straight to the dashboard.
 *
 * The password itself is not included — it's hashed by the auth provider the
 * moment it's set, so we genuinely cannot read it back, and a plaintext
 * password sitting in an inbox is a liability rather than a convenience.
 */
export async function sendPasswordSetEmail(restaurantId: string): Promise<boolean> {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          contactEmail: true,
          staff: {
            where: { role: "admin" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { username: true, email: true },
          },
        },
      }),
    );
    const owner = r?.staff[0];
    // Prefer the address they set on the account; fall back to the lead email.
    const to = owner?.email?.includes("@staff.") ? r?.contactEmail?.trim() : owner?.email?.trim();
    const target = to || r?.contactEmail?.trim();
    if (!r || !target || !owner?.username) return false;

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return await send(target, `Your ${r.name} login is ready`, [
      "Your password is set — you're all set to sign in.",
      `Username: ${owner.username}`,
      `Sign in here: ${base}/login`,
      "We don't include your password in emails, so keep it somewhere safe. If you ever lose it, reply to this email and we'll send a fresh reset link.",
    ]);
  } catch {
    return false;
  }
}

/**
 * The Servd team's answer to feedback an owner sent from their dashboard.
 *
 * Quotes what they wrote back to them. Weeks can pass between sending feedback
 * and getting a reply, and an answer with no question attached reads like a
 * stranger's email.
 *
 * An account email, not marketing: somebody who asked us a question is owed the
 * answer whether or not they take our newsletter.
 */
export async function sendFeedbackReplyEmail(
  to: string,
  original: string,
  reply: string,
): Promise<boolean> {
  try {
    return await send(to, "Re: your feedback to Servd", [
      "Thanks for writing to us — here's our reply.",
      reply,
      "———",
      `You wrote: "${original.slice(0, 500)}${original.length > 500 ? "…" : ""}"`,
      "You can also read this in your Servd dashboard under Send feedback.",
    ]);
  } catch {
    return false;
  }
}
