import "server-only";
import { partnerInviteEmail } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";

/**
 * Queue a staff invitation.
 *
 * QUEUED, NOT SENT DIRECTLY. `outbound_emails` already has a drainer that
 * retries, claims before it sends and records its runs; a second sending path
 * would be a second place to get idempotency wrong, and the failure mode of
 * getting it wrong here is an invitation delivered four times.
 *
 * THE TOKEN PROBLEM, AND WHY IT IS ENCRYPTED.
 *
 * `partner_invites` stores only a SHA-256 of the token, so a leaked database
 * cannot accept an invitation — that is the property the column exists for. The
 * sender therefore cannot reconstruct the link from the row, and
 * `outbound_emails.payload` is documented as NEVER carrying a token or a
 * password.
 *
 * Three ways out, and this is the third:
 *
 *   1. put the raw token in the payload — breaks that rule and puts a live
 *      credential in an unencrypted table;
 *   2. send synchronously at invite time — a second sending path, and an
 *      invitation that fails either rolls back a seat or vanishes silently;
 *   3. ENCRYPT the token into the payload with CREDENTIALS_ENCRYPTION_KEY.
 *
 * Three keeps one sending path and keeps the security property: a database
 * leaked without the key is still useless, which is exactly what `tokenHash`
 * was protecting. The drainer decrypts at send time and composes the link.
 *
 * Returns the queued row's id, so the invitation can point at it and /team can
 * say whether the email actually left. Null means nothing was queued.
 */
export async function queueInviteEmail(input: {
  partnerId: string;
  partnerName: string;
  email: string;
  role: string;
  token: string;
  invitedBy: string;
  expiresAt: Date;
}): Promise<string | null> {
  let tokenEnc: string;
  try {
    tokenEnc = encryptSecret(input.token);
  } catch {
    // CREDENTIALS_ENCRYPTION_KEY is not set on this deployment. Queueing a row
    // we could never turn into a link would be worse than not queueing — the
    // admin still has the copy-link fallback, and /team says so.
    return null;
  }

  try {
    const row = await systemDb((tx) =>
      tx.outboundEmail.create({
        data: {
          template: "partner.invite",
          toEmail: input.email,
          toName: null,
          partnerId: input.partnerId,
          payload: {
            partnerName: input.partnerName,
            role: input.role,
            invitedBy: input.invitedBy,
            expiresAt: input.expiresAt.toISOString(),
            // Encrypted, never raw. See the note above.
            tokenEnc,
          },
        },
        select: { id: true },
      }),
    );
    return row.id;
  } catch {
    return null;
  }
}

/**
 * Render a queued invitation. Called by the drainer, not by a screen.
 *
 * Returns null when the token cannot be decrypted — a row written under a
 * different encryption key, which is unrecoverable and must not be sent as a
 * broken link.
 */
export function renderInvite(
  payload: Record<string, unknown>,
  appUrl: string,
): { subject: string; paragraphs: string[] } | null {
  const str = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
  const tokenEnc = str("tokenEnc");
  if (!tokenEnc) return null;

  let token: string;
  try {
    token = decryptSecret(tokenEnc);
  } catch {
    return null;
  }

  const expiresAt = new Date(str("expiresAt"));
  if (Number.isNaN(expiresAt.getTime())) return null;

  return partnerInviteEmail({
    partnerName: str("partnerName") || "Your team",
    invitedBy: str("invitedBy") || "An admin",
    role: str("role") || "sales",
    acceptUrl: `${appUrl.replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`,
    expiresAt,
  });
}
