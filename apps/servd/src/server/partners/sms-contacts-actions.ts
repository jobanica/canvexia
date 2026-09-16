"use server";

import { revalidatePath } from "next/cache";
import { normalizeMobile } from "@servd/core";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { captureConsent } from "./sms-contacts";

export type ContactState = { ok?: boolean; message?: string; error?: string } | null;

/**
 * The contact book's writes.
 *
 * `sms.send` GATES ALL OF THEM, including the manual add. That is deliberate
 * and worth saying: adding a contact is not a neutral act — a row that says
 * `opted_in` is a licence to text somebody, and whoever may create one should
 * be the same person the partner trusted with sending.
 */
async function sender() {
  return requireWritablePartner("sms.send");
}

/** One contact, typed in by somebody who asked the person in front of them. */
export async function addContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const who = await sender();
  if (!who) return { error: "You can't add SMS contacts." };

  const consent = String(formData.get("consent") ?? "");
  if (consent !== "yes" && consent !== "no") {
    return { error: "Say whether they agreed to be texted." };
  }

  const result = await captureConsent({
    partnerId: who.partnerId,
    mobile: String(formData.get("mobile") ?? ""),
    consented: consent === "yes",
    source: "manual",
    origin: "manual",
    name: String(formData.get("name") ?? "").trim() || null,
    businessName: String(formData.get("businessName") ?? "").trim() || null,
    staffName: who.partner.user.name ?? who.email,
    staffEmail: who.email,
  });

  if (!result.ok) {
    return {
      error:
        result.reason === "bad_number"
          ? "That doesn't look like a PH mobile number."
          : "Could not save that contact.",
    };
  }

  revalidatePath("/partner/sms/contacts");
  return {
    ok: true,
    message:
      result.status === "opted_in"
        ? "Added, and marked as opted in."
        : "Added. They won't be sent marketing texts.",
  };
}

/**
 * A CSV import, which the partner ADMIN has to attest to.
 *
 * THE ATTESTATION IS THE WHOLE POINT. A file of numbers carries no consent with
 * it; somebody has to say, in their own words and under their own name, where
 * that consent came from — and that sentence is stored on every row it creates
 * and in the audit log. Without it this would be the one door in the product
 * through which an unconsented list walks straight into a campaign.
 *
 * `team.manage` on top of `sms.send`: the brief says the partner admin attests,
 * and an import is a different act from typing one number in.
 */
export async function importContactsAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const who = await requireWritablePartner("team.manage");
  if (!who) return { error: "Only a partner admin can import a list." };

  const attestation = String(formData.get("attestation") ?? "").trim();
  if (attestation.length < 20) {
    return {
      error:
        "Say in a sentence where this consent came from. It is stored against every number.",
    };
  }
  if (String(formData.get("attested") ?? "") !== "on") {
    return { error: "Tick the box to confirm every number on this list agreed." };
  }

  const csv = String(formData.get("csv") ?? "");
  const rows = parseCsv(csv);
  if (rows.length === 0) return { error: "No numbers found in that." };
  if (rows.length > 2000) return { error: "That's more than 2,000 rows. Split the file." };

  let added = 0;
  let skipped = 0;
  for (const row of rows) {
    const result = await captureConsent({
      partnerId: who.partnerId,
      mobile: row.mobile,
      consented: true,
      source: "import_attested",
      origin: "import",
      name: row.name,
      businessName: row.businessName,
      staffName: who.partner.user.name ?? who.email,
      staffEmail: who.email,
      detail: attestation,
    });
    if (result.ok) added += 1;
    else skipped += 1;
  }

  await systemDb((tx) =>
    writeSeatAudit(tx, who, {
      action: "sms.import_attested",
      entityType: "sms_contact",
      // The attestation and the counts, never the list.
      after: { added, skipped, attestation },
    }),
  );

  revalidatePath("/partner/sms/contacts");
  return {
    ok: true,
    message:
      skipped > 0
        ? `${added} imported. ${skipped} skipped — those weren't readable PH mobile numbers.`
        : `${added} imported.`,
  };
}

/**
 * Parse pasted CSV. Deliberately forgiving about shape, strict about numbers.
 *
 * Accepts `mobile`, `mobile,name`, or `mobile,name,business` with or without a
 * header row, because the file comes out of whatever the operator had. A row
 * whose first field is not a PH mobile is SKIPPED and counted, not guessed at:
 * importing a misread number means texting a stranger.
 */
function parseCsv(text: string): { mobile: string; name: string | null; businessName: string | null }[] {
  const out: { mobile: string; name: string | null; businessName: string | null }[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length === 0 || !cells[0]) continue;
    const mobile = normalizeMobile(cells[0]);
    // A header row fails this, which is how the header is skipped without
    // having to guess whether one is present.
    if (!mobile || seen.has(mobile)) continue;
    seen.add(mobile);
    out.push({
      mobile,
      name: cells[1] || null,
      businessName: cells[2] || null,
    });
  }
  return out;
}

/**
 * An admin recording that somebody asked to be taken off the list.
 *
 * ONE DIRECTION ONLY. There is no action here that moves a contact back to
 * opted in, because the brief forbids it and so does the law: the only way back
 * is a new consent event in the real world — a visit, a form, a reply — and
 * each of those has its own capture point that records what happened.
 */
export async function optOutContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const who = await sender();
  if (!who) return { error: "You can't change SMS contacts." };

  const id = String(formData.get("contactId") ?? "").trim();
  if (!id) return { error: "Nothing to do." };

  try {
    const r = await systemDb(async (tx) => {
      const updated = await tx.smsContact.updateMany({
        where: { id, partnerId: who.partnerId },
        data: { consentStatus: "opted_out", optedOutAt: new Date(), consentSource: "manual" },
      });
      if (updated.count > 0) {
        await writeSeatAudit(tx, who, {
          action: "sms.opted_out",
          entityType: "sms_contact",
          entityId: id,
          after: { via: "staff" },
        });
      }
      return updated.count;
    });
    if (r === 0) return { error: "We can't find that contact." };
  } catch {
    return { error: "Could not save that." };
  }

  revalidatePath("/partner/sms/contacts");
  return { ok: true, message: "Opted out. They won't be texted again." };
}
