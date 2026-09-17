import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { DEFAULT_MILESTONES } from "@servd/core";

/**
 * Turn an application into a partner.
 *
 * ONE TRANSACTION. Six things happen together or none do:
 *
 *   1. a `partners` row, prefilled from the application
 *   2. an admin seat in `partner_users`
 *   3. an invite in `partner_invites` (the token is returned once, never stored)
 *   4. a `territory_assignments` row and the territory marked taken
 *   5. the application marked converted and pointed at the new partner
 *   6. an audit row
 *
 * A half-converted applicant — a territory marked taken with no partner to work
 * it, or a partner with no way to sign in — is the worst outcome available
 * here, and it is exactly what happens without the transaction: the second
 * write fails, the first stands, and the only person who can tell is whoever
 * finds the city unsellable in three weeks.
 *
 * THE WELCOME EMAIL IS QUEUED, NOT SENT. `CREDENTIALS_ENCRYPTION_KEY` is not
 * set on this project, so the Resend credentials cannot even be stored. Failing
 * the conversion over that would be absurd; sending nothing and saying nothing
 * would be worse. The row goes into `outbound_emails` and the caller is told
 * whether email is configured, so HQ can hand the invite link over by another
 * route today.
 *
 * A PARTNER HQ SIGNED DIRECTLY comes through here too, via `applicant` instead
 * of `applicationId`.
 *
 * REPORTED — "in the partners section in HQ, i dont have an option to create a
 * partner." There was none. Every partner in this system had to arrive as a
 * row in `partner_waitlist` first, which means somebody filling in the form on
 * canvexia.com — so a partner signed over coffee, or by phone, or at a trade
 * show, could not be entered at all. HQ's own list was read-only about the one
 * thing HQ does.
 *
 * It is one function and not two because the six writes below have to stay one
 * transaction, and a second copy of them is a second thing to keep correct.
 * The application row is still written — step 0 — rather than skipped: it is
 * the only record of where a partner came from, and a partner with no origin
 * would be a hole in exactly the audit trail this file exists to protect. It
 * is stamped `source: "hq"` so nobody later mistakes it for a real applicant.
 */

export interface ConvertInput {
  /** The application being converted. Blank when `applicant` is given. */
  applicationId: string;
  /**
   * A partner HQ signed directly, with no application behind them. An
   * application row is written for them first, inside the same transaction.
   */
  applicant?: {
    fullName: string;
    email: string;
    mobile: string;
    city: string;
    province?: string | null;
  };
  /** Blank means "keep the name on the application". */
  partnerName?: string;
  territoryId?: string | null;
  tier: "operator" | "reseller";
  revenueSharePct: number;
  collectionMode: "partner_collects" | "hq_collects";
  licenseStartedAt?: Date | null;
  actorEmail: string;
}

export type ConvertResult =
  | {
      ok: true;
      partnerId: string;
      /** Shown ONCE. Never stored, never in the audit log, never in the queue. */
      inviteToken: string;
      emailQueued: boolean;
      territoryAssigned: string | null;
    }
  | { ok: false; error: string };

/** Seven days, the same window the partner portal's own invites use. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function convertApplication(input: ConvertInput): Promise<ConvertResult> {
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // An operator on a 0% share is CANVEXIA earning nothing on a partner forever
  // with nothing surfacing to say so — the same refusal src/lib/partners/
  // revenue-share.ts already makes on the operator form.
  if (input.tier === "operator" && input.revenueSharePct <= 0) {
    return { ok: false, error: "An operator must keep some share. 70 is the standard." };
  }
  if (input.revenueSharePct < 0 || input.revenueSharePct > 100) {
    return { ok: false, error: "The share has to be between 0 and 100." };
  }

  try {
    return await systemDb(async (tx) => {
      // 0. The application. Read when there is one, written when HQ signed the
      //    partner themselves — same shape either way, so everything below is
      //    one code path.
      const app = input.applicant
        ? await tx.partnerWaitlist.create({
            data: {
              fullName: input.applicant.fullName,
              email: input.applicant.email,
              mobile: input.applicant.mobile,
              city: input.applicant.city,
              province: input.applicant.province || null,
              // Required by the schema and meaningless for somebody who never
              // filled in the form. Recorded as the honest minimum rather than
              // invented: nobody asked them how many hours a week they have.
              hoursPerWeek: "h20plus",
              soldBefore: false,
              // NOT "www". This row is HQ's own entry, and a screen counting
              // where demand comes from must not count it as a lead.
              source: "hq",
              status: "new",
              notes: "Signed by HQ directly. No application was submitted.",
            },
            select: {
              id: true,
              fullName: true,
              email: true,
              mobile: true,
              city: true,
              province: true,
              status: true,
              convertedPartnerId: true,
            },
          })
        : await tx.partnerWaitlist.findUnique({
            where: { id: input.applicationId },
            select: {
              id: true,
              fullName: true,
              email: true,
              mobile: true,
              city: true,
              province: true,
              status: true,
              convertedPartnerId: true,
            },
          });
      if (!app) throw new Error("GONE");
      if (app.convertedPartnerId) throw new Error("ALREADY");

      // The email is the partner's unique key. Somebody who applied twice, or
      // who already operates a city, is not a new partner — and a unique
      // violation here would surface as "something went wrong".
      const clash = await tx.partner.findUnique({
        where: { email: app.email },
        select: { id: true, name: true },
      });
      if (clash) throw new Error(`EXISTS:${clash.name}`);

      const name = (input.partnerName ?? "").trim() || app.fullName;

      // 1. The partner.
      const partner = await tx.partner.create({
        data: {
          name,
          email: app.email,
          status: "approved",
          tier: input.tier,
          revenueSharePct: input.revenueSharePct,
          collectionMode: input.collectionMode,
          territory: app.city,
          territoryId: input.territoryId ?? null,
          contactMobile: app.mobile,
          address: app.province ? `${app.city}, ${app.province}` : app.city,
          licenseStartedAt: input.licenseStartedAt ?? new Date(),
          // The platform ladder, written explicitly rather than left null.
          // Null means "use the default", which is the same numbers today — but
          // a partner's targets should not change because the default did.
          milestones: DEFAULT_MILESTONES as never,
        },
        select: { id: true, name: true },
      });

      // 2. The admin seat. `invited`, not `active`: nobody has accepted yet,
      // and recording otherwise would be a lie in the audit trail.
      await tx.partnerUser.create({
        data: {
          partnerId: partner.id,
          email: app.email,
          name: app.fullName,
          role: "admin",
          status: "invited",
        },
      });

      // 3. The invitation. The HASH is stored; the token is returned once.
      await tx.partnerInvite.create({
        data: {
          partnerId: partner.id,
          email: app.email,
          role: "admin",
          tokenHash,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });

      // 4. The territory, if one was picked.
      let territoryAssigned: string | null = null;
      if (input.territoryId) {
        const t = await tx.territory.findUnique({
          where: { id: input.territoryId },
          select: { id: true, name: true, partnerId: true, assignable: true },
        });
        if (!t) throw new Error("NO_TERRITORY");
        if (t.partnerId) throw new Error(`TAKEN:${t.name}`);
        if (!t.assignable) throw new Error(`SPLIT:${t.name}`);

        const now = new Date();
        await tx.territory.update({
          where: { id: t.id },
          data: { partnerId: partner.id, status: "taken", assignedAt: now },
        });
        await tx.territoryAssignment.create({
          data: {
            territoryId: t.id,
            partnerId: partner.id,
            assignedAt: now,
            actorEmail: input.actorEmail,
          },
        });
        await tx.partner.update({
          where: { id: partner.id },
          data: { territory: t.name },
        });
        territoryAssigned = t.name;
      }

      // 5. The application is KEPT and marked, never deleted: it is the only
      // record of where this partner came from.
      await tx.partnerWaitlist.update({
        where: { id: app.id },
        data: {
          status: "converted",
          convertedPartnerId: partner.id,
          contactedAt: new Date(),
        },
      });

      // 6. Queued, not sent. The payload carries no token — the sender composes
      // the invite link from the invite row, so a leak of that table is not a
      // leak of anybody's account.
      let emailQueued = false;
      try {
        await tx.outboundEmail.create({
          data: {
            template: "partner.welcome",
            toEmail: app.email,
            toName: app.fullName,
            partnerId: partner.id,
            payload: {
              partnerName: partner.name,
              territory: territoryAssigned,
              revenueSharePct: input.revenueSharePct,
            },
          },
        });
        emailQueued = true;
      } catch {
        /* outbound_emails not migrated — the conversion still stands */
      }

      await writeHqAudit(tx, {
        partnerId: partner.id,
        actorEmail: input.actorEmail,
        action: input.applicant ? "partner.created" : "application.converted",
        entityType: "partner",
        entityId: partner.id,
        // The terms and the city. NEVER the invite token.
        after: {
          from: app.id,
          name: partner.name,
          tier: input.tier,
          revenueSharePct: input.revenueSharePct,
          collectionMode: input.collectionMode,
          territory: territoryAssigned,
        },
      });

      return {
        ok: true as const,
        partnerId: partner.id,
        inviteToken: token,
        emailQueued,
        territoryAssigned,
      };
    });
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "GONE") return { ok: false, error: "That application no longer exists." };
    if (why === "ALREADY") return { ok: false, error: "This application was already converted." };
    if (why.startsWith("EXISTS:")) {
      return { ok: false, error: `${why.slice(7)} already uses that email address.` };
    }
    if (why.startsWith("TAKEN:")) {
      return { ok: false, error: `${why.slice(6)} is already licensed to somebody.` };
    }
    if (why.startsWith("SPLIT:")) {
      return { ok: false, error: `${why.slice(6)} was split. Pick one of its districts.` };
    }
    if (why === "NO_TERRITORY") return { ok: false, error: "That territory no longer exists." };
    return { ok: false, error: "The conversion failed. Nothing was created." };
  }
}
