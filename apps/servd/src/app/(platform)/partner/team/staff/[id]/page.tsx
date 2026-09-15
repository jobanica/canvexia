import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePartnerPageWith, partnerAllows } from "@/server/partners/auth";
import {
  getStaffProfile,
  getStaffBook,
  getStaffActivity,
  getStaffCounts,
} from "@/server/partners/staff";
import { listTeam } from "@/server/partners/team";
import { PortalShell } from "@/components/partner/PortalShell";
import { StaffDetail } from "@/components/partner/StaffDetail";

export const metadata = { title: "Staff · CANVEXIA" };

/**
 * One staff member.
 *
 * `hr.view_own` is the floor, because everyone can open their OWN record — that
 * is the whole point of the permission. Reading somebody ELSE's needs
 * `hr.view_all`, which is checked below rather than in the gate, because the
 * gate cannot see whose record was asked for.
 */
export default async function PartnerStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const partner = await requirePartnerPageWith("hr.view_own");

  const isSelf = partner.user.id === id;
  const seesEveryone = partnerAllows(partner, "hr.view_all");
  if (!isSelf && !seesEveryone) notFound();

  // Emergency contact: admins and ops managers only, and never for a record
  // somebody is reading about themselves-as-a-colleague. Withheld at the SELECT,
  // so it is not in the payload rather than hidden in the markup.
  const profile = await getStaffProfile(partner.id, id, { includeEmergency: seesEveryone });
  if (!profile) notFound();

  const q = await searchParams;
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);
  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(q.from ?? "")
    ? q.from!
    : monthAgo.toISOString().slice(0, 10);
  const toStr = /^\d{4}-\d{2}-\d{2}$/.test(q.to ?? "") ? q.to! : today.toISOString().slice(0, 10);
  const range = { from: new Date(`${fromStr}T00:00:00Z`), to: new Date(`${toStr}T23:59:59Z`) };

  const canEdit = partnerAllows(partner, "team.manage") && !isSelf;
  const canAssign = partnerAllows(partner, "team.manage");
  // Your own activity is yours to read; somebody else's needs hr.view_all.
  const canSeeActivity = isSelf || seesEveryone;

  const [book, activity, counts, team] = await Promise.all([
    getStaffBook(partner.id, id),
    canSeeActivity
      ? getStaffActivity(partner.id, { id, email: profile.email }, range)
      : Promise.resolve([]),
    canSeeActivity ? getStaffCounts(partner.id, id, range) : Promise.resolve([]),
    canAssign ? listTeam(partner.id) : Promise.resolve({ seats: [], invites: [] }),
  ]);

  return (
    <PortalShell
      partner={partner}
      title={profile.name ?? profile.email}
      subtitle={profile.zone ?? undefined}
      actions={
        <Link
          href="/partner/team"
          className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
        >
          ← Team
        </Link>
      }
    >
      <StaffDetail
        profile={profile}
        book={book}
        activity={activity}
        counts={counts}
        colleagues={team.seats
          .filter((s) => s.status === "active" && s.id !== id)
          .map((s) => ({ id: s.id, name: s.name, email: s.email, role: s.role }))}
        canEdit={canEdit}
        canAssign={canAssign}
        canSeeActivity={canSeeActivity}
        range={{ from: fromStr, to: toStr }}
      />
    </PortalShell>
  );
}
