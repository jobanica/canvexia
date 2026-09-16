import "server-only";
import { randomBytes } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { kioskCode, verifyKioskCode } from "@/lib/partners/kiosk-token";

/**
 * Clock-in kiosks: the rows, and the one question the check-in asks them.
 *
 * `systemDb` throughout, with an explicit `partnerId` in every where clause.
 * The table is super-only in RLS because it holds each kiosk's signing secret —
 * anybody who can read that column can mint a valid clock-in code from their
 * sofa — so the scope here IS the where clause, and it is never derived from
 * anything the browser sent.
 */

export interface KioskRow {
  id: string;
  label: string;
  lat: number | null;
  lng: number | null;
  active: boolean;
  createdAt: Date;
}

/** Kiosks for the manager's screen. NEVER selects `secret`. */
export async function listKiosks(partnerId: string): Promise<KioskRow[]> {
  try {
    return await systemDb((tx) =>
      tx.attendanceKiosk.findMany({
        where: { partnerId },
        orderBy: [{ active: "desc" }, { label: "asc" }],
        select: { id: true, label: true, lat: true, lng: true, active: true, createdAt: true },
      }),
    );
  } catch {
    return [];
  }
}

export async function createKiosk(
  partnerId: string,
  input: { label: string; lat: number | null; lng: number | null },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const label = input.label.trim().slice(0, 80);
  if (label.length < 2) return { ok: false, message: "Give the kiosk a name." };

  try {
    const row = await systemDb((tx) =>
      tx.attendanceKiosk.create({
        data: {
          partnerId,
          label,
          lat: input.lat,
          lng: input.lng,
          // 32 bytes. Minted here and never shown to anybody: the display asks
          // the server for codes, so there is no reason for this value to leave
          // the database except into an HMAC.
          secret: randomBytes(32).toString("hex"),
        },
        select: { id: true },
      }),
    );
    return { ok: true, id: row.id };
  } catch {
    return { ok: false, message: "Could not add that kiosk." };
  }
}

/**
 * Turn a kiosk off, or rotate its secret.
 *
 * ROTATING IS THE ANSWER TO A PHOTOGRAPHED SCREEN, and it is instant: the
 * displays re-read the secret on their next tick, and every code minted under
 * the old one stops verifying within the bucket window. Deactivating is the
 * answer to a tablet that has walked off.
 */
export async function updateKiosk(
  partnerId: string,
  kioskId: string,
  change: { active?: boolean; rotate?: boolean; label?: string },
): Promise<boolean> {
  const data: { active?: boolean; secret?: string; label?: string } = {};
  if (typeof change.active === "boolean") data.active = change.active;
  if (change.rotate) data.secret = randomBytes(32).toString("hex");
  if (change.label) data.label = change.label.trim().slice(0, 80);
  if (Object.keys(data).length === 0) return false;

  try {
    const r = await systemDb((tx) =>
      tx.attendanceKiosk.updateMany({ where: { id: kioskId, partnerId }, data }),
    );
    return r.count > 0;
  } catch {
    return false;
  }
}

/**
 * The code to display right now, for a kiosk this partner owns.
 *
 * Returns null rather than a code for a kiosk that is off or belongs to
 * somebody else — the display polls this, so it is also what makes a
 * deactivation take effect on screen without anybody touching the tablet.
 */
export async function currentCode(
  partnerId: string,
  kioskId: string,
): Promise<{ code: string; label: string } | null> {
  try {
    const kiosk = await systemDb((tx) =>
      tx.attendanceKiosk.findFirst({
        where: { id: kioskId, partnerId, active: true },
        select: { id: true, label: true, secret: true },
      }),
    );
    if (!kiosk) return null;
    return {
      code: kioskCode({ secret: kiosk.secret, partnerId, kioskId: kiosk.id }),
      label: kiosk.label,
    };
  } catch {
    return null;
  }
}

export type ScanResult =
  | { ok: true; kioskId: string; label: string; lat: number | null; lng: number | null }
  | { ok: false; reason: "unknown" | "inactive" | "stale" };

export const SCAN_MESSAGE: Record<"unknown" | "inactive" | "stale", string> = {
  // "Unknown" covers a kiosk id that does not exist AND one belonging to another
  // partner. Those two are told apart nowhere the scanner can see, because the
  // difference is exactly what a probe would be looking for.
  unknown: "That code isn't one of your kiosks.",
  inactive: "That kiosk has been switched off. Ask your manager.",
  stale: "That code has expired — the screen refreshes every minute. Try again.",
};

/**
 * Verify a scanned code against the kiosk it names.
 *
 * THE PARTNER COMES FROM THE SESSION, never from the scan. A code carries a
 * kiosk id and nothing else that is trusted; looking the kiosk up under the
 * scanner's own partner id is what makes another operator's kiosk — the third
 * case the brief names — simply not exist.
 */
export async function verifyScan(
  partnerId: string,
  kioskId: string,
  code: string,
  at: Date = new Date(),
): Promise<ScanResult> {
  let kiosk: { id: string; label: string; secret: string; active: boolean; lat: number | null; lng: number | null } | null =
    null;
  try {
    kiosk = await systemDb((tx) =>
      tx.attendanceKiosk.findFirst({
        where: { id: kioskId, partnerId },
        select: { id: true, label: true, secret: true, active: true, lat: true, lng: true },
      }),
    );
  } catch {
    return { ok: false, reason: "unknown" };
  }
  if (!kiosk) return { ok: false, reason: "unknown" };
  if (!kiosk.active) return { ok: false, reason: "inactive" };
  if (!verifyKioskCode({ secret: kiosk.secret, partnerId, kioskId: kiosk.id }, code, at)) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true, kioskId: kiosk.id, label: kiosk.label, lat: kiosk.lat, lng: kiosk.lng };
}

/** Whether this seat is required to clock in at a kiosk. */
export async function kioskRequired(partnerId: string, partnerUserId: string): Promise<boolean> {
  try {
    const row = await systemDb((tx) =>
      tx.partnerUser.findFirst({
        where: { id: partnerUserId, partnerId },
        select: { kioskRequired: true },
      }),
    );
    return !!row?.kioskRequired;
  } catch {
    // Fails OPEN, deliberately. This flag exists to make a check-in stricter,
    // not to be the thing that stops somebody clocking in when a query fails —
    // the manager's screen shows the method on every row either way.
    return false;
  }
}
