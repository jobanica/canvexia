import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { hitRateLimitIn, RATE_WINDOW_MS } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";
import type { LeadInputValues } from "@/lib/partners/prospect-input";
import { writePartnerAudit } from "@/server/audit/log";

/**
 * The public lead form's write.
 *
 * THE ONLY UNAUTHENTICATED WRITE IN THE PARTNER PORTAL, and it gets the
 * waitlist's treatment exactly:
 *
 *  - A server action, never a browser client. `prospects` has no `anon` grant
 *    and no `authenticated` grant, so there is no direct path to it at all —
 *    which is stronger than a policy, because a grant nobody uses is a grant
 *    nobody notices (D27, on prospect_leads).
 *  - systemDb, because there is no session to scope to. The partnerId comes
 *    from the SLUG LOOKUP, never from the form: a hidden field naming another
 *    partner is the obvious attack and the shape of LeadInput is what refuses
 *    it — `partnerId` is not a field it has.
 *  - The DB-backed rate limiter from packages/db. In-memory enforces nothing on
 *    serverless, and the counter is keyed on a HASHED IP: we need to tell
 *    submitters apart, not to keep a log of who visited.
 *
 * FAILS OPEN on the limiter, and closed on everything else. A limiter that
 * breaks the form when its table is missing has done more damage than the
 * spam it prevents.
 */
const LIMIT = 8;

async function clientKey(): Promise<string> {
  const h = await headers();
  const raw =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function submitLead(
  partnerId: string,
  input: LeadInputValues,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const key = await clientKey();
    const hit = await systemDb((tx) =>
      hitRateLimitIn(tx, "partner:lead-form", key, RATE_WINDOW_MS),
    );
    if (hit.count > LIMIT) {
      return { ok: false, message: "That's a few too many in one go. Try again later." };
    }
  } catch {
    /* abuse control, not an authorization boundary — never block the funnel */
  }

  const assignedToId = await nextLeadOwner(partnerId);

  try {
    await systemDb(async (tx) => {
      const row = await tx.prospect.create({
        data: {
          // From the slug lookup, NOT from the form.
          partnerId,
          assignedToId,
          businessName: input.businessName,
          ownerName: input.ownerName,
          mobile: input.mobile,
          address: input.address,
          productId: input.productId,
          source: "lead_form",
          stage: "lead",
          // The public message lands in notes, prefixed so a partner reading it
          // later can tell what the person actually typed from what a
          // colleague added afterwards.
          notes: input.message ? `From the lead form: ${input.message}` : null,
        },
        select: { id: true, businessName: true },
      });

      // No actorEmail: nobody was signed in. actorType "system" is the honest
      // record — a stranger filled in a form, and pretending a partner did it
      // would make the audit trail wrong in the one place it is read.
      // actorType "system": nobody at the partner did this. A member of the
      // public filled in the operator's own lead form.
      await writePartnerAudit(tx, partnerId, {
        actorType: "system",
        action: "prospect.lead_form",
        entityType: "prospect",
        entityId: row.id,
        after: { businessName: row.businessName, source: "lead_form", assignedToId },
      });
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "Something went wrong on our side. Please try again." };
  }
}

/**
 * NOTIFICATION IS NOT WIRED, deliberately.
 *
 * The brief says a new lead notifies the partner. Resend reads its API key from
 * `platform_settings.emailCredsEnc`, decrypted with `CREDENTIALS_ENCRYPTION_KEY`
 * — unset on every deployment, and no key has ever been entered. A send that
 * silently no-ops would be worse than none, because the partner would believe
 * they were being told. `notification_prefs` stores the choice already; A6
 * turns it on when there is something to send with.
 */
export const LEAD_NOTIFICATIONS_ENABLED = false;


/**
 * Who a public lead goes to.
 *
 * ROUND-ROBIN AMONG ACTIVE SALES SEATS, by who has been waiting longest — the
 * seat with the oldest most-recent lead. Not a counter column and not random:
 * a counter needs a row to lock and drifts the moment somebody is deactivated,
 * and random gives one person four in a row often enough to be noticed and
 * resented.
 *
 * Falls back to the partner's `defaultLeadUserId`, and then to NOBODY. Null is
 * a real answer: a partner with no sales team yet should get an unassigned
 * prospect they can see in the pipeline, not a lead quietly filed against the
 * admin who will never look at it.
 */
async function nextLeadOwner(partnerId: string): Promise<string | null> {
  try {
    return await systemDb(async (tx) => {
      const seats = await tx.partnerUser.findMany({
        where: { partnerId, status: "active", role: "sales" },
        select: { id: true },
      });
      if (seats.length === 0) {
        const partner = await tx.partner.findUnique({
          where: { id: partnerId },
          select: { defaultLeadUserId: true },
        });
        return partner?.defaultLeadUserId ?? null;
      }

      // The most recent lead-form prospect per seat. A seat with none at all is
      // not in this list, which is what puts a new hire first.
      const latest = await tx.prospect.groupBy({
        by: ["assignedToId"],
        where: {
          partnerId,
          source: "lead_form",
          assignedToId: { in: seats.map((s) => s.id) },
        },
        _max: { createdAt: true },
      });
      const lastFor = new Map(
        latest.map((r) => [r.assignedToId as string, r._max.createdAt?.getTime() ?? 0]),
      );

      let pick = seats[0].id;
      let oldest = Number.POSITIVE_INFINITY;
      for (const seat of seats) {
        const at = lastFor.get(seat.id) ?? 0; // never had one → first in line
        if (at < oldest) {
          oldest = at;
          pick = seat.id;
        }
      }
      return pick;
    });
  } catch {
    // partner_users or the column is not migrated. Unassigned is correct and
    // visible; failing the lead would lose a real enquiry.
    return null;
  }
}
