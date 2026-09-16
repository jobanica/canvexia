import "server-only";
import {
  canReceiveMarketing,
  consentEvidence,
  normalizeMobile,
  type ConsentSource,
  type ConsentStatus,
} from "@servd/core";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";
import { writePartnerAudit } from "@/server/audit/log";

/**
 * The partner's SMS contact book, and the consent on each row.
 *
 * ONE RULE RUNS THROUGH ALL OF THIS: consent is only ever recorded as the
 * result of something that happened in the real world — somebody said yes at a
 * visit, ticked a box, or an admin attested to an import. There is no path in
 * here that sets `opted_in` because a screen wanted it to be true, and the one
 * function that could is the one that refuses to move an opt-out back.
 */

export interface ContactRow {
  id: string;
  mobile: string;
  name: string | null;
  businessName: string | null;
  source: string;
  tags: string[];
  consentStatus: ConsentStatus;
  consentAt: Date | null;
  consentSource: string | null;
  consentEvidence: string | null;
  lastSentAt: Date | null;
  /** Null when they can be sent to; otherwise the reason, for the greyed row. */
  createdAt: Date;
}

export async function listContacts(
  partnerId: string,
  opts: { search?: string; status?: ConsentStatus | "all" } = {},
): Promise<ContactRow[]> {
  const search = (opts.search ?? "").trim();
  try {
    const rows = await partnerDb(partnerId, (tx) =>
      tx.smsContact.findMany({
        where: {
          ...(opts.status && opts.status !== "all" ? { consentStatus: opts.status } : {}),
          ...(search
            ? {
                OR: [
                  { mobile: { contains: search } },
                  { name: { contains: search, mode: "insensitive" as const } },
                  { businessName: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: [{ consentStatus: "asc" }, { createdAt: "desc" }],
        take: 500,
        select: {
          id: true,
          mobile: true,
          name: true,
          businessName: true,
          source: true,
          tags: true,
          consentStatus: true,
          consentAt: true,
          consentSource: true,
          consentEvidence: true,
          lastSentAt: true,
          createdAt: true,
        },
      }),
    );
    return rows as ContactRow[];
  } catch {
    return [];
  }
}

export async function countByConsent(
  partnerId: string,
): Promise<{ opted_in: number; opted_out: number; unknown: number }> {
  const empty = { opted_in: 0, opted_out: 0, unknown: 0 };
  try {
    const rows = await partnerDb(partnerId, (tx) =>
      tx.smsContact.groupBy({ by: ["consentStatus"], _count: { _all: true } }),
    );
    const out = { ...empty };
    for (const r of rows as { consentStatus: string; _count: { _all: number } }[]) {
      if (r.consentStatus in out) {
        out[r.consentStatus as keyof typeof out] = r._count._all;
      }
    }
    return out;
  } catch {
    return empty;
  }
}

export interface CaptureInput {
  partnerId: string;
  mobile: string;
  /** The answer that was actually given. `false` is a real answer, not silence. */
  consented: boolean | null;
  source: ConsentSource;
  /** visit | lead_form | merchant_owner | import | manual — how we met them. */
  origin: "visit" | "lead_form" | "merchant_owner" | "import" | "manual";
  name?: string | null;
  businessName?: string | null;
  prospectId?: string | null;
  productId?: string | null;
  merchantId?: string | null;
  /** Whoever was standing there. Goes into the evidence sentence. */
  staffName?: string | null;
  staffEmail?: string | null;
  /** The form wording, or the import attestation. Stored verbatim. */
  detail?: string | null;
}

export type CaptureResult =
  | { ok: true; id: string; status: ConsentStatus }
  | { ok: false; reason: "bad_number" | "failed" };

/**
 * Record a contact and what they said.
 *
 * THE ONE ASYMMETRY THAT MATTERS: a `false` answer is written down as
 * `opted_out`, and an opted-out row is never moved back by this function — not
 * by a later visit, not by an import, not by an admin retyping the number. The
 * brief says a partner "cannot re-opt someone in without a new consent event",
 * and the only way this codebase lets that happen is a person replying to a
 * message, which goes through `recordReplyConsent` below.
 *
 * A `null` answer means nobody asked. It leaves an existing consent alone: the
 * merchant-onboarding screen is skippable, and skipping it must not quietly
 * erase a yes somebody gave at a visit last week.
 */
export async function captureConsent(input: CaptureInput): Promise<CaptureResult> {
  const mobile = normalizeMobile(input.mobile);
  if (!mobile) return { ok: false, reason: "bad_number" };

  const now = new Date();
  const evidence =
    input.consented === null
      ? null
      : consentEvidence({
          source: input.source,
          staffName: input.staffName ?? undefined,
          at: now,
          detail: input.detail ?? undefined,
        });

  try {
    const id = await systemDb(async (tx) => {
      const existing = await tx.smsContact.findFirst({
        where: { partnerId: input.partnerId, mobile },
        select: { id: true, consentStatus: true },
      });

      // The refusal, in one place. Everything else in this function is
      // bookkeeping; this line is the rule.
      const locked = existing?.consentStatus === "opted_out";
      const nextStatus: ConsentStatus = locked
        ? "opted_out"
        : input.consented === true
          ? "opted_in"
          : input.consented === false
            ? "opted_out"
            : ((existing?.consentStatus as ConsentStatus) ?? "unknown");

      const consentFields =
        locked || input.consented === null
          ? {}
          : {
              consentStatus: nextStatus,
              consentAt: now,
              consentSource: input.source,
              consentEvidence: evidence,
              ...(nextStatus === "opted_out" ? { optedOutAt: now } : {}),
            };

      const row = existing
        ? await tx.smsContact.update({
            where: { id: existing.id },
            data: {
              name: input.name ?? undefined,
              businessName: input.businessName ?? undefined,
              prospectId: input.prospectId ?? undefined,
              productId: input.productId ?? undefined,
              merchantId: input.merchantId ?? undefined,
              ...consentFields,
            },
            select: { id: true },
          })
        : await tx.smsContact.create({
            data: {
              partnerId: input.partnerId,
              mobile,
              name: input.name ?? null,
              businessName: input.businessName ?? null,
              source: input.origin,
              prospectId: input.prospectId ?? null,
              productId: input.productId ?? null,
              merchantId: input.merchantId ?? null,
              createdBy: input.staffEmail ?? null,
              consentStatus: nextStatus,
              consentAt: input.consented === null ? null : now,
              consentSource: input.consented === null ? null : input.source,
              consentEvidence: evidence,
              optedOutAt: nextStatus === "opted_out" ? now : null,
            },
            select: { id: true },
          });

      // Every consent change is audited. The evidence lives on the contact and
      // can be edited by a later capture; the audit row cannot.
      if (input.consented !== null && !locked) {
        await writePartnerAudit(tx, input.partnerId, {
          actorEmail: input.staffEmail ?? "system",
          action: nextStatus === "opted_in" ? "sms.consent_given" : "sms.consent_refused",
          entityType: "sms_contact",
          entityId: row.id,
          // The number is already in the entity; the evidence is the point.
          after: { mobile, source: input.source, evidence },
        });
      }

      return row.id;
    });

    const status: ConsentStatus =
      input.consented === true ? "opted_in" : input.consented === false ? "opted_out" : "unknown";
    return { ok: true, id, status };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * STOP, everywhere.
 *
 * ACROSS EVERY PARTNER, by phone number alone — the same rule the diner-side
 * webhook has always followed. A person who texts STOP has opted out of being
 * marketed to, not out of one operator's list, and this platform is one sender
 * as far as they are concerned.
 *
 * Returns the rows that were not already opted out, so the caller can send the
 * single confirmation the brief asks for and no more.
 */
export async function optOutEverywhere(
  mobile: string,
  at: Date = new Date(),
): Promise<{ partnerId: string; id: string; confirmed: boolean }[]> {
  const number = normalizeMobile(mobile);
  if (!number) return [];

  try {
    return await systemDb(async (tx) => {
      const rows = await tx.smsContact.findMany({
        // NO partnerId. That is the point of this function.
        where: { mobile: number },
        select: { id: true, partnerId: true, consentStatus: true, optOutConfirmedAt: true },
      });
      if (rows.length === 0) return [];

      await tx.smsContact.updateMany({
        where: { mobile: number },
        data: { consentStatus: "opted_out", optedOutAt: at, consentSource: "reply" },
      });

      for (const row of rows) {
        await writePartnerAudit(tx, row.partnerId, {
          actorEmail: "inbound-sms",
          action: "sms.opted_out",
          entityType: "sms_contact",
          entityId: row.id,
          before: { consentStatus: row.consentStatus },
          after: { consentStatus: "opted_out", via: "reply" },
        });
      }

      return rows.map((r) => ({
        partnerId: r.partnerId,
        id: r.id,
        confirmed: r.optOutConfirmedAt !== null,
      }));
    });
  } catch {
    return [];
  }
}

/** Mark that the one opt-out confirmation has gone out. */
export async function markOptOutConfirmed(ids: string[], at: Date = new Date()): Promise<void> {
  if (ids.length === 0) return;
  try {
    await systemDb((tx) =>
      tx.smsContact.updateMany({
        where: { id: { in: ids }, optOutConfirmedAt: null },
        data: { optOutConfirmedAt: at },
      }),
    );
  } catch {
    /* the opt-out itself is recorded; the receipt is secondary */
  }
}

/** Who a campaign may go to. The only query that decides that. */
export async function sendableContacts(
  partnerId: string,
): Promise<{ id: string; mobile: string; name: string | null; businessName: string | null }[]> {
  try {
    return await partnerDb(partnerId, (tx) =>
      tx.smsContact.findMany({
        where: { consentStatus: "opted_in" },
        select: { id: true, mobile: true, name: true, businessName: true },
      }),
    );
  } catch {
    return [];
  }
}

/** Re-exported so a screen and the sender agree on what "sendable" means. */
export { canReceiveMarketing };
