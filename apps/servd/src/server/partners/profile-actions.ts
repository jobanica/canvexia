"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";

export type ProfileState = { ok?: string; error?: string } | null;

/**
 * A SEAT EDITING ITS OWN RECORD.
 *
 * `updateStaffProfileAction` needs `team.manage`, which a field agent does not
 * have and should not: it edits ANYBODY's record. This one edits exactly one —
 * the person making the request — so the gate is not a permission at all. It is
 * the session.
 *
 * WHY IT HAD TO EXIST. The merchant page now says who to call, and the number
 * it calls is on the seat's own staff record. Until today the only way that
 * number got there was an admin typing it in on the team screen, which means
 * every field agent's contact card read "No mobile on their profile yet" until
 * somebody else fixed it for them.
 *
 * WHAT IT DELIBERATELY CANNOT CHANGE: their role, their status, their email, or
 * whose partner they belong to. Those are the whole of the access control on
 * this account, and a self-service form that could touch any of them would be
 * a privilege escalation with a friendly label.
 *
 * IT STILL GOES THROUGH `requireWritablePartner`, and the first draft of this
 * did not — it read the session directly and checked `impersonatedBy` by hand.
 * `tests/hq/impersonation.test.ts` refused it, correctly: a hand-rolled check is
 * exactly the one somebody forgets, and the whole point of that gate is that
 * refusing an HQ view-as session is not a thing each action decides for itself.
 *
 * `overview.view` is the key, because it is the one every working seat holds by
 * default. It is not a claim that this person may edit staff records — they may
 * not — it is the gate saying they are a live seat writing as themselves.
 */
export async function updateMyProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const who = await requireWritablePartner("overview.view");
  if (!who) return { error: "This session can't edit a profile." };
  // A legacy login IS the partner account — one Supabase user, no seat row — so
  // there is no personal record to edit. Said plainly rather than failing.
  if (!who.userId) return { error: "This login has no staff record to edit." };
  const partner = who.partner;
  const seatId = who.userId;

  const trim = (k: string, max: number) =>
    String(formData.get(k) ?? "").trim().slice(0, max) || null;

  const name = trim("name", 120);
  if (!name) return { error: "Give your name — it is what your merchants see." };

  const data = {
    name,
    mobile: trim("mobile", 40),
    emergencyName: trim("emergencyName", 120),
    emergencyMobile: trim("emergencyMobile", 40),
  };

  try {
    await systemDb(async (tx) => {
      // The seat id comes from the session, and the partner id is in the WHERE
      // clause anyway: a mismatch updates zero rows rather than somebody else's
      // record.
      const done = await tx.partnerUser.updateMany({
        where: { id: seatId, partnerId: partner.id },
        data,
      });
      if (done.count === 0) throw new Error("GONE");

      await writeSeatAudit(tx, who, {
        action: "partner.profile_updated",
        entityType: "partner_user",
        entityId: seatId,
        // The emergency contact is NOT written into the audit row. The log is
        // read by more people than the record is, and a value copied into it
        // has escaped the thing that was guarding it.
        after: { name: data.name, mobile: data.mobile },
      });
    });
  } catch {
    return { error: "Couldn't save that. Try again." };
  }

  revalidatePath("/partner/me");
  revalidatePath("/partner/team");
  return { ok: "Saved." };
}
