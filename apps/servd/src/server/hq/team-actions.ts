"use server";

import { revalidatePath } from "next/cache";
import { HQ_USER_ROLES, isHqUserRole } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { requireHqAction } from "./auth";
import { matchesSegment, type Segment } from "./announcements";

export type TeamState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Add an HQ seat.
 *
 * It creates the `platform_admins` row, NOT the Supabase auth user — this
 * codebase has no server-side user-creation path that does not involve the
 * service-role key minting a password, and inventing one for a handful of
 * internal people is the wrong trade. The person is created in the Supabase
 * dashboard and their id pasted here, which is the same step
 * `bootstrap-hq-admin.sql` describes for the very first seat.
 */
export async function addHqSeatAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  let actor;
  try {
    actor = await requireHqAction("hq.team");
  } catch {
    return { status: "error", message: "Only a super admin can manage the HQ team." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const authUserId = String(formData.get("authUserId") ?? "").trim();
  const role = String(formData.get("role") ?? "ops").trim();

  if (!email.includes("@")) return { status: "error", message: "That is not an email address." };
  if (!UUID_RE.test(authUserId)) {
    return {
      status: "error",
      message: "Paste their Supabase user id — create them under Authentication → Users first.",
    };
  }
  if (!isHqUserRole(role)) {
    return { status: "error", message: `Role must be one of: ${HQ_USER_ROLES.join(", ")}.` };
  }

  try {
    await systemDb(async (tx) => {
      const clash = await tx.platformAdmin.findFirst({
        where: { OR: [{ email }, { authUserId }] },
        select: { id: true, status: true },
      });
      if (clash) {
        // Reactivate rather than refuse: a seat that was deactivated and is
        // being re-added is the common case, and the row is deliberately kept
        // so past actions stay attributable.
        await tx.platformAdmin.update({
          where: { id: clash.id },
          data: {
            status: "active",
            deactivatedAt: null,
            // NULL is stored for super_admin — see the note in core/roles.ts.
            role: role === "ops" ? "ops" : null,
            email,
            displayName,
            authUserId,
          },
        });
      } else {
        await tx.platformAdmin.create({
          data: {
            email,
            displayName,
            authUserId,
            role: role === "ops" ? "ops" : null,
            status: "active",
            invitedBy: actor.id,
          },
        });
      }
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: clash ? "hq.seat_reactivated" : "hq.seat_added",
        entityType: "platform_admin",
        // The email and the role. NEVER the auth user id — it is the thing a
        // leaked audit log could be used with.
        after: { email, role },
      });
    });

    revalidatePath("/hq/team");
    return { status: "done", message: `${email} can sign in as ${role.replace("_", " ")}.` };
  } catch {
    return { status: "error", message: "Could not add that seat." };
  }
}

export async function setHqSeatStatusAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  let actor;
  try {
    actor = await requireHqAction("hq.team");
  } catch {
    return { status: "error", message: "Only a super admin can manage the HQ team." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const deactivate = formData.get("deactivate") === "yes";

  try {
    const message = await systemDb(async (tx) => {
      const seat = await tx.platformAdmin.findUnique({
        where: { id },
        select: { id: true, email: true, role: true, status: true },
      });
      if (!seat) throw new Error("GONE");
      // Locking yourself out of the console that grants access is not
      // recoverable from inside it.
      if (deactivate && seat.id === actor.id) throw new Error("SELF");

      if (deactivate) {
        // The last super admin cannot be removed: the seat that can restore
        // anybody's access would be gone, and the only way back is the
        // bootstrap SQL.
        const supers = await tx.platformAdmin.count({
          where: { status: "active", role: null },
        });
        if (seat.role === null && supers <= 1) throw new Error("LAST");
      }

      await tx.platformAdmin.update({
        where: { id },
        data: {
          status: deactivate ? "deactivated" : "active",
          deactivatedAt: deactivate ? new Date() : null,
        },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: deactivate ? "hq.seat_deactivated" : "hq.seat_reactivated",
        entityType: "platform_admin",
        entityId: id,
        before: { status: seat.status },
        after: { email: seat.email, status: deactivate ? "deactivated" : "active" },
      });
      return `${seat.email} ${deactivate ? "can no longer sign in" : "can sign in again"}.`;
    });

    revalidatePath("/hq/team");
    return { status: "done", message };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "SELF") return { status: "error", message: "You cannot deactivate yourself." };
    if (why === "LAST") {
      return {
        status: "error",
        message: "That is the last super admin. Add another before removing this one.",
      };
    }
    if (why === "GONE") return { status: "error", message: "That seat no longer exists." };
    return { status: "error", message: "Could not change that seat." };
  }
}

// ----------------------------------------------------------------------------
// Announcements.
// ----------------------------------------------------------------------------

function readSegment(formData: FormData): Segment | null {
  const pick = (name: string) => formData.getAll(name).map(String).filter(Boolean);
  const tier = pick("tier");
  const status = pick("segmentStatus");
  const productId = pick("productId");
  // Nothing ticked means every partner, not nobody — see matchesSegment.
  if (tier.length === 0 && status.length === 0 && productId.length === 0) return null;
  return {
    ...(tier.length ? { tier } : {}),
    ...(status.length ? { status } : {}),
    ...(productId.length ? { productId } : {}),
  };
}

export async function saveAnnouncementAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  let actor;
  try {
    actor = await requireHqAction("announcements.write");
  } catch {
    return { status: "error", message: "You do not have permission to post announcements." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const level = String(formData.get("level") ?? "info").trim();
  const when = String(formData.get("publish") ?? "draft").trim();
  const scheduledRaw = String(formData.get("scheduledFor") ?? "").trim();

  if (title.length < 3) return { status: "error", message: "Give it a title." };
  if (body.length < 10) return { status: "error", message: "Write something." };
  if (!["info", "warning", "incident"].includes(level)) {
    return { status: "error", message: "Pick a level." };
  }

  const segment = readSegment(formData);
  const now = new Date();
  let publishedAt: Date | null = null;
  let scheduledFor: Date | null = null;

  if (when === "now") publishedAt = now;
  if (when === "schedule") {
    if (!scheduledRaw) return { status: "error", message: "Pick a date and time." };
    scheduledFor = new Date(`${scheduledRaw}:00+08:00`);
    if (Number.isNaN(scheduledFor.getTime())) {
      return { status: "error", message: "That is not a time." };
    }
    if (scheduledFor.getTime() <= now.getTime()) {
      return { status: "error", message: "That time has already passed." };
    }
  }

  try {
    const message = await systemDb(async (tx) => {
      const data = { title, body, level, segment: (segment ?? undefined) as never, scheduledFor, publishedAt };
      if (id) {
        const before = await tx.hqAnnouncement.findUnique({
          where: { id },
          select: { publishedAt: true, title: true },
        });
        if (!before) throw new Error("GONE");
        // A published announcement stays published. Un-publishing something
        // partners have already read is not an edit, it is a retraction, and
        // the honest form of that is a new notice saying so.
        await tx.hqAnnouncement.update({
          where: { id },
          data: { ...data, publishedAt: before.publishedAt ?? publishedAt },
        });
        await writeHqAudit(tx, {
          actorEmail: actor.email,
          action: "announcement.updated",
          entityType: "hq_announcement",
          entityId: id,
          after: { title, level, published: !!(before.publishedAt ?? publishedAt) },
        });
        return `${title} saved.`;
      }

      const created = await tx.hqAnnouncement.create({
        data: { ...data, authorEmail: actor.email },
        select: { id: true },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: publishedAt ? "announcement.published" : "announcement.drafted",
        entityType: "hq_announcement",
        entityId: created.id,
        after: { title, level, segment },
      });
      return publishedAt
        ? `${title} is live.`
        : scheduledFor
          ? `${title} goes out on ${scheduledRaw}.`
          : `${title} saved as a draft.`;
    });

    revalidatePath("/hq/announcements");
    revalidatePath("/partner");
    return { status: "done", message };
  } catch (e) {
    if (e instanceof Error && e.message === "GONE") {
      return { status: "error", message: "That announcement no longer exists." };
    }
    return { status: "error", message: "Could not save that." };
  }
}

/** Preview who a segment covers, before anything goes out. */
export async function countAudience(segment: Segment | null): Promise<number> {
  const partners = await systemDb((tx) =>
    tx.partner.findMany({ select: { tier: true, status: true, enabledProducts: true } }),
  );
  return partners.filter((p) =>
    matchesSegment(
      {
        tier: p.tier,
        status: p.status,
        enabledProducts: Array.isArray(p.enabledProducts) ? (p.enabledProducts as string[]) : null,
      },
      segment,
    ),
  ).length;
}
