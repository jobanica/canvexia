import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { requireHqAction, type CurrentHqUser } from "./auth";

/**
 * "VIEW AS PARTNER" — HQ inside an operator's own console, read-only.
 *
 * The single most dangerous thing in the HQ brief, and the reason the partner
 * portal's own merchant impersonation was left unbuilt rather than half-built:
 * *half an impersonation flow is a security hole with a spinner.* So the whole
 * mechanism is here, in one file, and the rules it depends on are stated rather
 * than distributed across three screens.
 *
 * FIVE PROPERTIES, each load-bearing:
 *
 *  1. NO ROLE ESCALATION. This never touches Supabase Auth, never mints a
 *     partner session, and never gives the HQ user a `partner_users` row. The
 *     cookie it sets is a DIFFERENT cookie from the partner session, so a
 *     partner's own login and an impersonation can never be confused for one
 *     another — including by code written later that only checks the other one.
 *
 *  2. SHORT-LIVED. Thirty minutes, checked against the row's `expiresAt` on
 *     every request rather than trusted from the cookie. A cookie kept past its
 *     expiry buys nothing.
 *
 *  3. SINGLE USE. The token is redeemed once, at which point `usedAt` is set
 *     and the token itself stops working. A link pasted into a chat is not a
 *     second way in.
 *
 *  4. REVOCABLE, WHICH A SIGNATURE IS NOT. This is why the grant is a database
 *     row and not only a signed string: a signed token cannot be withdrawn and
 *     leaves nothing to audit. The row can be killed and the audit log has
 *     something to point at.
 *
 *  5. READ-ONLY, ENFORCED AT THE ACTION. `assertNotImpersonating()` below is
 *     called by every partner server action. Hiding buttons is not the control
 *     — a server action is reachable by its id from any page.
 *
 * WHAT IS STORED IS A HASH. Never the token. A row that can be read back into a
 * working session turns a database leak into a login.
 */

/** Thirty minutes, as the brief specifies. */
export const GRANT_TTL_MS = 30 * 60 * 1000;

/**
 * Deliberately NOT the partner session cookie.
 *
 * Two cookies rather than one with a flag inside it: a flag has to be read
 * correctly by every caller forever, and the failure mode of forgetting is an
 * impersonation treated as a real login. Two names means code that only knows
 * about the partner session cannot accidentally accept this one.
 */
export const IMPERSONATION_COOKIE = "canvexia_view_as";

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ImpersonationSession {
  grantId: string;
  partnerId: string;
  hqAdminEmail: string;
  expiresAt: Date;
  readOnly: boolean;
}

/**
 * Mint a grant. Super admin only — `hq.impersonate` is denied to ops.
 *
 * Returns the token ONCE. It is not stored and cannot be recovered; a lost link
 * is a new grant, which is the correct amount of friction for this.
 */
export async function createImpersonationGrant(input: {
  partnerId: string;
  reason: string;
}): Promise<{ ok: true; token: string; expiresAt: Date } | { ok: false; error: string }> {
  let actor: CurrentHqUser;
  try {
    actor = await requireHqAction("hq.impersonate");
  } catch {
    return { ok: false, error: "You do not have permission to view a partner's portal." };
  }

  const reason = input.reason.trim();
  // A reason is required and it is not a formality: this is the field that
  // answers "why was HQ inside Cebu's console on the 14th" when somebody asks.
  if (reason.length < 4) {
    return { ok: false, error: "Say why you need to open this partner's portal." };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + GRANT_TTL_MS);

  try {
    await systemDb(async (tx) => {
      const partner = await tx.partner.findUnique({
        where: { id: input.partnerId },
        select: { id: true, name: true },
      });
      if (!partner) throw new Error("NO_PARTNER");

      const grant = await tx.impersonationGrant.create({
        data: {
          hqAdminId: actor.id,
          hqAdminEmail: actor.email,
          partnerId: input.partnerId,
          tokenHash: hash(token),
          readOnly: true,
          expiresAt,
          reason,
        },
        select: { id: true },
      });

      await writeHqAudit(tx, {
        partnerId: input.partnerId,
        actorEmail: actor.email,
        action: "hq.impersonation.granted",
        entityType: "impersonation_grant",
        entityId: grant.id,
        reason,
        // The partner and the window. NEVER the token.
        after: { partner: partner.name, expiresAt: expiresAt.toISOString(), readOnly: true },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_PARTNER") {
      return { ok: false, error: "That partner no longer exists." };
    }
    return { ok: false, error: "Could not open a session. Try again." };
  }

  return { ok: true, token, expiresAt };
}

/**
 * Redeem a token once and set the cookie.
 *
 * The lookup is by hash, so a token that is not in the table simply finds
 * nothing. `timingSafeEqual` on the hashes is belt-and-braces over an indexed
 * equality lookup, and costs nothing.
 */
export async function redeemImpersonationGrant(
  token: string,
): Promise<{ ok: true; partnerId: string } | { ok: false; error: string }> {
  const tokenHash = hash(token);

  try {
    const partnerId = await systemDb(async (tx) => {
      const grant = await tx.impersonationGrant.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          partnerId: true,
          hqAdminEmail: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
          tokenHash: true,
        },
      });
      if (!grant) throw new Error("INVALID");

      const a = Buffer.from(grant.tokenHash);
      const b = Buffer.from(tokenHash);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("INVALID");

      if (grant.revokedAt) throw new Error("REVOKED");
      if (grant.usedAt) throw new Error("USED");
      if (grant.expiresAt.getTime() <= Date.now()) throw new Error("EXPIRED");

      await tx.impersonationGrant.update({
        where: { id: grant.id },
        data: { usedAt: new Date() },
      });

      await writeHqAudit(tx, {
        partnerId: grant.partnerId,
        actorEmail: grant.hqAdminEmail,
        action: "hq.impersonation.start",
        entityType: "impersonation_grant",
        entityId: grant.id,
      });

      return grant.partnerId;
    });

    const jar = await cookies();
    jar.set(IMPERSONATION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(GRANT_TTL_MS / 1000),
    });

    return { ok: true, partnerId };
  } catch (e) {
    const why = e instanceof Error ? e.message : "INVALID";
    return {
      ok: false,
      error:
        why === "EXPIRED"
          ? "That link has expired. Open a new one from the partner's page."
          : why === "USED"
            ? "That link has already been used. Open a new one."
            : why === "REVOKED"
              ? "That session was ended."
              : "That link is not valid.",
    };
  }
}

/**
 * The live impersonation, if there is one.
 *
 * EVERY CHECK IS AGAINST THE ROW, not the cookie. The cookie carries the token
 * and nothing else — no partner id, no expiry, no flag — so there is nothing in
 * it worth forging. Expiry, revocation and which partner are all read back.
 */
export async function getImpersonation(): Promise<ImpersonationSession | null> {
  const jar = await cookies();
  const token = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!token) return null;

  try {
    const grant = await systemDb((tx) =>
      tx.impersonationGrant.findUnique({
        where: { tokenHash: hash(token) },
        select: {
          id: true,
          partnerId: true,
          hqAdminEmail: true,
          expiresAt: true,
          revokedAt: true,
          endedAt: true,
          readOnly: true,
        },
      }),
    );
    if (!grant) return null;
    if (grant.revokedAt || grant.endedAt) return null;
    if (grant.expiresAt.getTime() <= Date.now()) return null;
    return {
      grantId: grant.id,
      partnerId: grant.partnerId,
      hqAdminEmail: grant.hqAdminEmail,
      expiresAt: grant.expiresAt,
      readOnly: grant.readOnly,
    };
  } catch {
    // The table is not migrated, or the read failed. Null means "not
    // impersonating", which for getImpersonation is the SAFE answer — it is
    // used to decide whether to show a banner. The refusal below fails the
    // other way on purpose.
    return null;
  }
}

/**
 * The gate every partner server action calls.
 *
 * Throws when a write is attempted inside an impersonation session. This is the
 * whole of "read-only" — hiding buttons is a courtesy, and a server action is
 * reachable by its id from any page.
 *
 * FAILS CLOSED, unlike `getImpersonation` above. If the cookie is present and
 * the grant cannot be read for any reason, the write is refused rather than
 * allowed: "we could not tell whether this is HQ" is not a reason to let the
 * write through.
 */
export async function assertNotImpersonating(): Promise<void> {
  const jar = await cookies();
  if (!jar.get(IMPERSONATION_COOKIE)?.value) return;

  const live = await getImpersonation();
  // A present cookie with no readable grant: refuse. An expired or revoked
  // grant is not a licence to write.
  if (!live || live.readOnly) {
    throw new Error("READ_ONLY_SESSION");
  }
}

/** End a session deliberately: clears the cookie and closes the row. */
export async function endImpersonation(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(IMPERSONATION_COOKIE)?.value;
  jar.delete(IMPERSONATION_COOKIE);
  if (!token) return;

  try {
    await systemDb(async (tx) => {
      const grant = await tx.impersonationGrant.findUnique({
        where: { tokenHash: hash(token) },
        select: { id: true, partnerId: true, hqAdminEmail: true, usedAt: true, endedAt: true },
      });
      if (!grant || grant.endedAt) return;
      const endedAt = new Date();
      await tx.impersonationGrant.update({ where: { id: grant.id }, data: { endedAt } });
      await writeHqAudit(tx, {
        partnerId: grant.partnerId,
        actorEmail: grant.hqAdminEmail,
        action: "hq.impersonation.end",
        entityType: "impersonation_grant",
        entityId: grant.id,
        // The duration, which is what the impersonation log is read for.
        after: {
          seconds: grant.usedAt
            ? Math.round((endedAt.getTime() - grant.usedAt.getTime()) / 1000)
            : null,
        },
      });
    });
  } catch {
    /* the cookie is already gone, which is the part that matters */
  }
}
