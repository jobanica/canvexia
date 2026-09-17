"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { requireHqAction } from "./auth";
import { convertApplication } from "./convert";

export type ApplicationState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string }
  | {
      /**
       * The invite link, shown ONCE.
       *
       * It is in the action's result and nowhere else — not the audit log, not
       * the email queue, not the database, which holds only its SHA-256. If HQ
       * loses it, the answer is to resend the invitation from the partner's
       * team screen, not to look it up.
       */
      status: "converted";
      message: string;
      partnerId: string;
      inviteToken: string;
      emailQueued: boolean;
    };

const STATUSES = ["new", "contacted", "shortlisted", "rejected"] as const;

export async function setApplicationStatusAction(
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  let actor;
  try {
    actor = await requireHqAction("applications.write");
  } catch {
    return { status: "error", message: "You do not have permission to work applications." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  // `converted` is NOT settable here. It is a consequence of the conversion
  // transaction, and letting somebody type it would produce an application
  // marked converted with no partner behind it.
  if (!(STATUSES as readonly string[]).includes(status)) {
    return { status: "error", message: "That is not a status." };
  }

  try {
    await systemDb(async (tx) => {
      const before = await tx.partnerWaitlist.findUnique({
        where: { id },
        select: { status: true, convertedPartnerId: true },
      });
      if (!before) throw new Error("GONE");
      if (before.convertedPartnerId) throw new Error("CONVERTED");

      await tx.partnerWaitlist.update({
        where: { id },
        data: {
          status: status as never,
          notes: notes || null,
          // Stamped the first time somebody moves it off `new`, not overwritten
          // afterwards: "when did we first reach out" is the question it
          // answers, and re-stamping would erase it.
          contactedAt: status === "new" ? null : new Date(),
        },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: `application.${status}`,
        entityType: "partner_waitlist",
        entityId: id,
        before: { status: before.status },
        after: { status },
      });
    });

    revalidatePath("/hq/applications");
    return { status: "done", message: `Marked ${status}.` };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "GONE") return { status: "error", message: "That application no longer exists." };
    if (why === "CONVERTED") {
      return { status: "error", message: "This one is already a partner." };
    }
    return { status: "error", message: "Could not save that." };
  }
}

export async function convertApplicationAction(
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  let actor;
  try {
    actor = await requireHqAction("applications.write");
  } catch {
    return { status: "error", message: "You do not have permission to convert applications." };
  }

  const applicationId = String(formData.get("id") ?? "").trim();
  const tier = String(formData.get("tier") ?? "operator");
  const share = Number(String(formData.get("revenueSharePct") ?? "70"));
  const collectionMode = String(formData.get("collectionMode") ?? "partner_collects");
  const territoryId = String(formData.get("territoryId") ?? "").trim() || null;
  const startRaw = String(formData.get("licenseStartedAt") ?? "").trim();

  if (tier !== "operator" && tier !== "reseller") {
    return { status: "error", message: "Pick a tier." };
  }
  if (collectionMode !== "partner_collects" && collectionMode !== "hq_collects") {
    return { status: "error", message: "Pick who collects." };
  }
  if (!Number.isFinite(share)) {
    return { status: "error", message: "The share has to be a number." };
  }

  const result = await convertApplication({
    applicationId,
    partnerName: String(formData.get("partnerName") ?? ""),
    territoryId,
    tier,
    revenueSharePct: Math.round(share),
    collectionMode,
    // Manila, so a licence started "today" is today in the Philippines rather
    // than eight hours earlier in UTC — the same reason the statement month is
    // computed the way it is.
    licenseStartedAt: startRaw ? new Date(`${startRaw}T00:00:00+08:00`) : null,
    actorEmail: actor.email,
  });

  if (!result.ok) return { status: "error", message: result.error };

  revalidatePath("/hq/applications");
  revalidatePath("/hq/partners");
  revalidatePath("/hq/territories");
  revalidatePath("/hq");

  return {
    status: "converted",
    partnerId: result.partnerId,
    inviteToken: result.inviteToken,
    emailQueued: result.emailQueued,
    message: result.territoryAssigned
      ? `Partner created and licensed for ${result.territoryAssigned}.`
      : "Partner created. No territory was assigned.",
  };
}

/**
 * CREATE A PARTNER HQ SIGNED THEMSELVES.
 *
 * REPORTED — "in the partners section in HQ, i dont have an option to create a
 * partner." Correct: the only way in was to convert an application, and an
 * application only exists if somebody filled in the form on canvexia.com. A
 * partner signed in person had no way into the system.
 *
 * `partners.write`, not `applications.write`. The thing being created is a
 * partner; the application row written alongside it is bookkeeping. Ops holds
 * both, so this changes nothing about who can do it today — it means the
 * capability still names the right thing if that ever stops being true.
 *
 * Everything else is `convertApplication`'s, deliberately: same transaction,
 * same territory checks, same one-shot invite, same audit row. A second way to
 * make a partner is a second thing that can make a HALF partner.
 */
export async function createPartnerAction(
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  let actor;
  try {
    actor = await requireHqAction("partners.write");
  } catch {
    return { status: "error", message: "You do not have permission to create partners." };
  }

  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const fullName = text("fullName");
  const email = text("email").toLowerCase();
  const mobile = text("mobile");
  const city = text("city");

  // Named one at a time. "Fill in the required fields" makes somebody hunt.
  if (!fullName) return { status: "error", message: "Who is the contact? Give their full name." };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "That email address does not look right." };
  }
  if (!mobile) return { status: "error", message: "A mobile number, so somebody can reach them." };
  if (!city) return { status: "error", message: "Which city do they cover?" };

  const tier = text("tier") || "operator";
  const share = Number(text("revenueSharePct") || "70");
  const collectionMode = text("collectionMode") || "partner_collects";
  const territoryId = text("territoryId") || null;
  const startRaw = text("licenseStartedAt");

  if (tier !== "operator" && tier !== "reseller") {
    return { status: "error", message: "Pick a tier." };
  }
  if (collectionMode !== "partner_collects" && collectionMode !== "hq_collects") {
    return { status: "error", message: "Pick who collects." };
  }
  if (!Number.isFinite(share)) {
    return { status: "error", message: "The share has to be a number." };
  }

  const result = await convertApplication({
    applicationId: "",
    applicant: { fullName, email, mobile, city, province: text("province") || null },
    partnerName: text("partnerName") || fullName,
    territoryId,
    tier,
    revenueSharePct: Math.round(share),
    collectionMode,
    // Manila, so a licence starting "today" is today in the Philippines rather
    // than eight hours earlier in UTC.
    licenseStartedAt: startRaw ? new Date(`${startRaw}T00:00:00+08:00`) : null,
    actorEmail: actor.email,
  });

  if (!result.ok) return { status: "error", message: result.error };

  revalidatePath("/hq/partners");
  revalidatePath("/hq/applications");
  revalidatePath("/hq/territories");
  revalidatePath("/hq");

  return {
    status: "converted",
    partnerId: result.partnerId,
    inviteToken: result.inviteToken,
    emailQueued: result.emailQueued,
    message: result.territoryAssigned
      ? `Partner created and licensed for ${result.territoryAssigned}.`
      : "Partner created. No territory was assigned.",
  };
}
