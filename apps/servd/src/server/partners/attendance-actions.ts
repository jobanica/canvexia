"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { uploadFieldPhoto } from "@/server/storage/field-photos";
import { checkVisit, distanceMeters, isUsable, type Point } from "@/lib/partners/geo";
import { VISIT_OUTCOMES, type VisitOutcome } from "@/lib/partners/outcomes";
import { manilaDayKey, subjectLocation } from "@/server/partners/attendance";
import { managerSeats, queueNotification } from "@/server/partners/notify";
import { kioskRequired, SCAN_MESSAGE, verifyScan } from "@/server/partners/kiosk";
import { captureConsent } from "@/server/partners/sms-contacts";

export type FieldState = { ok?: boolean; error?: string; queued?: boolean } | null;

// One list, shared with the field app and the manager's screen.
const OUTCOMES = VISIT_OUTCOMES;
type Outcome = VisitOutcome;

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

/** Rounded metres between the phone and the kiosk, when both are known. */
function metersFromKiosk(phone: Point | null, kiosk: Point | null): number | null {
  if (!phone || !kiosk) return null;
  return Math.round(distanceMeters(phone, kiosk));
}

/**
 * Resolve the kiosk half of a clock-in.
 *
 * THREE OUTCOMES, and the middle one is the point: a seat marked
 * `kioskRequired` that sends no scan is REFUSED, while everybody else falls
 * back to a GPS check-in exactly as before. The flag is per seat because a
 * field salesperson has no kiosk to stand in front of.
 *
 * A scan that fails verification is refused for everyone, required or not. A
 * stale code silently becoming a GPS check-in would mean the method column says
 * "gps" for somebody who was standing at the kiosk, and — worse — that nobody
 * ever finds out the kiosk screen is frozen.
 */
async function resolveKiosk(
  who: { partnerId: string; userId: string | null },
  formData: FormData,
): Promise<
  | { ok: true; method: "gps" | "qr"; kioskId: string | null; kioskPoint: Point | null }
  | { ok: false; error: string }
> {
  const kioskId = String(formData.get("kioskId") ?? "").trim();
  const code = String(formData.get("kioskCode") ?? "").trim();

  if (kioskId && code) {
    const scan = await verifyScan(who.partnerId, kioskId, code);
    if (!scan.ok) return { ok: false, error: SCAN_MESSAGE[scan.reason] };
    return {
      ok: true,
      method: "qr",
      kioskId: scan.kioskId,
      kioskPoint: isUsable({ lat: scan.lat ?? 0, lng: scan.lng ?? 0 })
        ? { lat: scan.lat as number, lng: scan.lng as number }
        : null,
    };
  }

  if (who.userId && (await kioskRequired(who.partnerId, who.userId))) {
    return { ok: false, error: "Scan the kiosk code to clock in." };
  }
  return { ok: true, method: "gps", kioskId: null, kioskPoint: null };
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

  const kiosk = await resolveKiosk(who, formData);
  if (!kiosk.ok) return { error: kiosk.error };

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
          // GPS is still recorded on a QR check-in, per the brief: the code
          // proves which device they stood at, the coordinates are the
          // corroboration, and a manager wants both on the row.
          method: kiosk.method,
          kioskId: kiosk.kioskId,
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
          // How far the phone was from the kiosk it scanned, when both are
          // known. There is no column for it on the session — the QR is the
          // proof of presence, this is corroboration — but a manager looking
          // at a suspicious day wants it recorded somewhere, and the event log
          // is where "what happened" already lives.
          detail: {
            dayKey,
            located: !!point,
            method: kiosk.method,
            metersFromKiosk: metersFromKiosk(point, kiosk.kioskPoint),
          },
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

  const kiosk = await resolveKiosk(who, formData);
  if (!kiosk.ok) return { error: kiosk.error };

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
        checkOutMethod: kiosk.method,
        checkOutKioskId: kiosk.kioskId,
      },
    });
    if (r.count > 0) {
      await tx.staffEvent.create({
        data: {
          partnerId: who.partnerId,
          partnerUserId: who.userId!,
          kind: "attendance.check_out",
          detail: {
            dayKey,
            located: !!point,
            method: kiosk.method,
            metersFromKiosk: metersFromKiosk(point, kiosk.kioskPoint),
          },
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

  /**
   * THE PHOTO IS THE PROOF, so it is required.
   *
   * Operators have no addresses on file — a salesperson walking into a
   * carinderia nobody has heard of is how the business gets discovered — so on
   * a first visit there is nothing for the GPS check to compare against and
   * `checkVisit` honestly reports `no_address`. Without a photo a visit is just
   * a claim typed into a phone.
   *
   * REFUSED, NOT SHRUGGED OFF. This used to swallow an upload failure and keep
   * the visit; that made sense when the photo was decoration. Now a visit
   * without one is the thing we are trying to prevent, so a failed upload is an
   * error the person can act on — and the field app keeps the visit in hand
   * rather than losing it.
   */
  const photo = String(formData.get("photo") ?? "");
  if (!photo.startsWith("data:image/")) {
    return { error: "Take a photo of the visit — that is what records you were there." };
  }

  let photoPath: string;
  try {
    photoPath = await uploadFieldPhoto(who.partnerId, who.userId, photo);
  } catch {
    return { error: "That photo didn't upload. Try again where you have signal." };
  }

  try {
    await systemDb(async (tx) => {
      const visit = await tx.staffVisit.create({
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

      /**
       * THE FIRST VISIT RECORDS WHERE THE BUSINESS IS.
       *
       * Nothing here geocodes an address string, so a prospect has never had
       * coordinates and every prospect visit has been unverifiable — not just
       * the first. Writing the first visit's position fixes every LATER visit:
       * from then on "were they where they were last time?" is a question with
       * an answer.
       *
       * ONLY WHEN IT IS NOT ALREADY SET. A second visit must not move the pin,
       * or somebody who logs from the wrong place quietly redefines where the
       * business is and makes their own mistake look correct.
       */
      if (subjectType === "prospect" && point) {
        await tx.prospect.updateMany({
          where: { id: subjectId, partnerId: who.partnerId, latitude: null },
          data: {
            latitude: point.lat,
            longitude: point.lng,
            locatedAt: new Date(),
            locatedByVisit: visit.id,
          },
        });
      }

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

  /**
   * The consent answer, recorded as a contact.
   *
   * AFTER the visit is written and never in its transaction: a consent capture
   * that failed must not lose the visit, which is the record of somebody's
   * work. `smsConsent` is a required field on the form — "no" is a real answer
   * and is written down as an opt-out, which is what stops the same person
   * being asked every fortnight and stops anybody texting them meanwhile.
   */
  const smsConsent = String(formData.get("smsConsent") ?? "");
  if (smsConsent === "yes" || smsConsent === "no") {
    await captureConsent({
      partnerId: who.partnerId,
      mobile: String(formData.get("smsMobile") ?? ""),
      consented: smsConsent === "yes",
      source: "visit",
      origin: "visit",
      businessName: name,
      prospectId: subjectType === "prospect" ? subjectId : null,
      productId: subjectType === "merchant" ? productId : null,
      merchantId: subjectType === "merchant" ? subjectId : null,
      staffName: who.partner.user.name ?? who.email,
      staffEmail: who.email,
    });
  }

  // Best effort and AFTER the write. A manager's notice is not worth failing a
  // visit for, and a salesperson standing in the street has already moved on.
  await queueNotification({
    partnerId: who.partnerId,
    event: "visit.logged",
    to: await managerSeats(who.partnerId),
    subject: `${who.partner.user.name ?? who.email} visited ${name}`,
    body:
      `${who.partner.user.name ?? who.email} logged a visit to ${name}.\n` +
      `Outcome: ${outcome.replace(/_/g, " ")}.` +
      (check.flag === "far" ? `\n${check.note}` : "") +
      (notes ? `\n\nNotes: ${notes}` : ""),
  });

  revalidatePath("/partner/attendance");
  revalidatePath("/partner");
  return { ok: true };
}

/**
 * Tell each manager who has not checked in by 10am, Manila.
 *
 * ONE NOTICE PER PARTNER PER DAY, not one per absent person: five separate
 * emails at 10am is how a manager builds a filter rule, and then the day
 * somebody really is missing they do not see it either.
 *
 * Only seats that hold `attendance.checkin` are expected to check in. A partner
 * whose admin never works the field should not be reported absent every
 * morning — that is the notice that teaches people to ignore this one.
 */
export async function notifyMissedCheckIns(asOf: Date = new Date()): Promise<number> {
  const dayKey = manilaDayKey(asOf);
  let sent = 0;
  try {
    const partners = await systemDb((tx) =>
      tx.partner.findMany({ where: { status: "approved" }, select: { id: true, name: true } }),
    );

    for (const partner of partners) {
      const [seats, sessions] = await systemDb(async (tx) => [
        await tx.partnerUser.findMany({
          // `sales` and `support` are the field roles by default. Resolved by
          // ROLE rather than by the editable permission for the same reason
          // managerSeats is: a partner who granted attendance.checkin to their
          // admins would otherwise get their own name in this email daily.
          where: { partnerId: partner.id, status: "active", role: { in: ["sales", "support"] } },
          select: { id: true, name: true, email: true },
        }),
        await tx.attendanceSession
          .findMany({ where: { partnerId: partner.id, dayKey }, select: { partnerUserId: true } })
          .catch(() => [] as { partnerUserId: string }[]),
      ]);

      const inToday = new Set(sessions.map((s) => s.partnerUserId));
      const missing = seats.filter((s) => !inToday.has(s.id));
      if (missing.length === 0) continue;

      sent += await queueNotification({
        partnerId: partner.id,
        event: "checkin.missed",
        to: await managerSeats(partner.id),
        subject: `${missing.length} not checked in`,
        body:
          `Not checked in as of 10am:\n` +
          missing.map((m) => `  - ${m.name ?? m.email}`).join("\n"),
      });
    }
  } catch {
    /* never break the cron over a notice */
  }
  return sent;
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
