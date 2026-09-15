"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { uploadFieldPhoto } from "@/server/storage/field-photos";
import { checkVisit, isUsable, type Point } from "@/lib/partners/geo";
import { manilaDayKey, subjectLocation } from "@/server/partners/attendance";

export type FieldState = { ok?: boolean; error?: string; queued?: boolean } | null;

const OUTCOMES = ["met_owner", "not_available", "follow_up", "signed"] as const;
type Outcome = (typeof OUTCOMES)[number];

/** A coordinate off the form, or null. Never (0, 0) and never a partial pair. */
function pointFrom(formData: FormData): { point: Point | null; accuracy: number | null } {
  const num = (k: string) => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const lat = num("lat");
  const lng = num("lng");
  const point = lat !== null && lng !== null ? { lat, lng } : null;
  return { point: isUsable(point) ? point : null, accuracy: num("accuracy") };
}

/**
 * Check in for the day.
 *
 * ONE SESSION PER MANILA DAY, enforced by a unique index rather than by asking
 * first: two taps on a flaky connection is the normal case on a phone in a
 * market, not an edge case, and a check-then-insert has a gap between the two.
 * A duplicate is treated as success, because from the person's point of view it
 * is — they are checked in.
 *
 * LOCATION IS OPTIONAL. A phone that refuses the permission, or is indoors with
 * no fix, still checks the person in; the row simply has no coordinates and the
 * manager's view says so. Refusing the check-in would mean somebody who turned
 * up cannot record that they did, which is a worse failure than a missing dot
 * on a map.
 */
export async function checkInAction(_prev: FieldState, formData: FormData): Promise<FieldState> {
  const who = await requireWritablePartner("attendance.checkin");
  if (!who?.userId) return { error: "You can't check in from this account." };

  const { point, accuracy } = pointFrom(formData);
  const dayKey = manilaDayKey();
  const device = String(formData.get("device") ?? "").slice(0, 200) || null;
  const clientRef = String(formData.get("clientRef") ?? "").trim() || null;
  const photo = String(formData.get("photo") ?? "");

  let photoPath: string | null = null;
  if (photo.startsWith("data:image/")) {
    try {
      photoPath = await uploadFieldPhoto(who.partnerId, who.userId, photo);
    } catch {
      // A failed upload must not fail the check-in. The selfie is corroboration,
      // not the record.
    }
  }

  try {
    await systemDb(async (tx) => {
      await tx.attendanceSession.create({
        data: {
          partnerId: who.partnerId,
          partnerUserId: who.userId!,
          dayKey,
          checkInLat: point?.lat ?? null,
          checkInLng: point?.lng ?? null,
          checkInAccuracy: accuracy,
          checkInPhoto: photoPath,
          device,
          clientRef,
        },
        select: { id: true },
      });
      await tx.staffEvent.create({
        data: {
          partnerId: who.partnerId,
          partnerUserId: who.userId!,
          kind: "attendance.check_in",
          detail: { dayKey, located: !!point },
        },
        select: { id: true },
      });
    });
  } catch {
    // Unique violation on (partnerUserId, dayKey) or on clientRef. Already
    // checked in is not an error to show somebody.
    revalidatePath("/partner/attendance");
    return { ok: true };
  }

  revalidatePath("/partner/attendance");
  revalidatePath("/partner");
  return { ok: true };
}

/**
 * Check out.
 *
 * Only closes a session that is still OPEN. Re-submitting must not move a
 * check-out time that already exists — the first one is when they actually
 * stopped, and the second is a double tap.
 */
export async function checkOutAction(_prev: FieldState, formData: FormData): Promise<FieldState> {
  const who = await requireWritablePartner("attendance.checkin");
  if (!who?.userId) return { error: "You can't check out from this account." };

  const { point, accuracy } = pointFrom(formData);
  const dayKey = manilaDayKey();
  const photo = String(formData.get("photo") ?? "");

  let photoPath: string | null = null;
  if (photo.startsWith("data:image/")) {
    try {
      photoPath = await uploadFieldPhoto(who.partnerId, who.userId, photo);
    } catch {
      /* the check-out still stands */
    }
  }

  const n = await systemDb(async (tx) => {
    const r = await tx.attendanceSession.updateMany({
      where: {
        partnerId: who.partnerId,
        partnerUserId: who.userId!,
        dayKey,
        checkOutAt: null,
      },
      data: {
        checkOutAt: new Date(),
        checkOutLat: point?.lat ?? null,
        checkOutLng: point?.lng ?? null,
        checkOutAccuracy: accuracy,
        checkOutPhoto: photoPath,
      },
    });
    if (r.count > 0) {
      await tx.staffEvent.create({
        data: {
          partnerId: who.partnerId,
          partnerUserId: who.userId!,
          kind: "attendance.check_out",
          detail: { dayKey, located: !!point },
        },
        select: { id: true },
      });
    }
    return r.count;
  });

  revalidatePath("/partner/attendance");
  revalidatePath("/partner");
  return n > 0 ? { ok: true } : { error: "You are not checked in today." };
}

/**
 * Log a visit to a prospect or a merchant.
 *
 * THE DISTANCE IS COMPUTED AND STORED, not recomputed later. A distance derived
 * on every read would move when a merchant's address is corrected, quietly
 * rewriting what a visit looked like on the day it happened.
 *
 * `clientRef` makes it idempotent. The device mints a UUID before it has a
 * connection; the column is unique; a queue that replays — which it will,
 * because that is what a queue on a phone does — is a no-op rather than a
 * second visit in somebody's count.
 */
export async function logVisitAction(_prev: FieldState, formData: FormData): Promise<FieldState> {
  const who = await requireWritablePartner("attendance.checkin");
  if (!who?.userId) return { error: "You can't log visits from this account." };

  const subjectType = String(formData.get("subjectType") ?? "");
  if (subjectType !== "prospect" && subjectType !== "merchant") {
    return { error: "Pick a prospect or a merchant." };
  }
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  if (!subjectId) return { error: "Pick who you visited." };

  const productId = String(formData.get("productId") ?? "").trim() || null;
  const outcome = String(formData.get("outcome") ?? "") as Outcome;
  if (!OUTCOMES.includes(outcome)) return { error: "Pick what happened." };

  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  const clientRef = String(formData.get("clientRef") ?? "").trim() || null;
  const { point, accuracy } = pointFrom(formData);

  const { point: subjectPoint, name } = await subjectLocation(
    who.partnerId,
    subjectType,
    productId,
    subjectId,
  );
  if (name === null) return { error: "We can't find that on your list." };

  const check = checkVisit(point, subjectPoint, accuracy);

  const photo = String(formData.get("photo") ?? "");
  let photoPath: string | null = null;
  if (photo.startsWith("data:image/")) {
    try {
      photoPath = await uploadFieldPhoto(who.partnerId, who.userId, photo);
    } catch {
      /* the visit still stands */
    }
  }

  try {
    await systemDb(async (tx) => {
      await tx.staffVisit.create({
        data: {
          partnerId: who.partnerId,
          partnerUserId: who.userId!,
          subjectType,
          productId,
          subjectId,
          subjectName: name,
          lat: point?.lat ?? null,
          lng: point?.lng ?? null,
          accuracy,
          distanceMeters: check.distanceMeters,
          outcome,
          notes,
          photoPath,
          clientRef,
        },
        select: { id: true },
      });
      await tx.staffEvent.create({
        data: {
          partnerId: who.partnerId,
          partnerUserId: who.userId!,
          kind: "visit.logged",
          subjectType,
          productId,
          subjectId,
          detail: { name, outcome, flag: check.flag },
        },
        select: { id: true },
      });

      // The outcome moves the prospect, when it says so. "Signed" is the one
      // that must not be left to somebody remembering to also update the
      // pipeline — that is the gap where a closed deal sits in "contacted" for
      // a fortnight.
      if (subjectType === "prospect") {
        const stage =
          outcome === "signed" ? "paid" : outcome === "follow_up" ? "contacted" : null;
        if (stage) {
          await tx.prospect.updateMany({
            where: { id: subjectId, partnerId: who.partnerId },
            // `stage` only. There is no "last contacted" column on this table
            // and inventing one from a visit would make the pipeline's own
            // follow-up dates disagree with it.
            data: { stage: stage as never },
          });
          await tx.staffEvent.create({
            data: {
              partnerId: who.partnerId,
              partnerUserId: who.userId!,
              kind: "prospect.stage",
              subjectType: "prospect",
              subjectId,
              detail: { name, stage },
            },
            select: { id: true },
          });
        }
      }

      await writeSeatAudit(tx, who, {
        action: "partner.visit_logged",
        entityType: subjectType,
        entityId: subjectId,
        after: { outcome, flag: check.flag, distanceMeters: check.distanceMeters },
      });
    });
  } catch {
    // A replayed clientRef. Already logged is success from the phone's point of
    // view, and telling it otherwise would make the queue retry forever.
    revalidatePath("/partner/attendance");
    return { ok: true };
  }

  revalidatePath("/partner/attendance");
  revalidatePath("/partner");
  return { ok: true };
}

/**
 * Close every session left open past midnight, Manila.
 *
 * Run from the daily digest cron rather than as a seventh schedule. It does NOT
 * invent a check-out time: `checkOutAt` is set to the end of that Manila day and
 * `autoClosed` is set beside it, so a manager sees "never checked out" rather
 * than a plausible-looking 6pm that nobody typed.
 *
 * Returns the number closed, for the cron's record.
 */
export async function autoCloseSessions(asOf: Date = new Date()): Promise<number> {
  const today = manilaDayKey(asOf);
  try {
    const r = await systemDb((tx) =>
      tx.attendanceSession.updateMany({
        where: { checkOutAt: null, dayKey: { lt: today } },
        data: { autoClosed: true, checkOutAt: new Date(`${today}T00:00:00+08:00`) },
      }),
    );
    return r.count;
  } catch {
    return 0;
  }
}
