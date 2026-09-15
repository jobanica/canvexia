import { getCurrentPartner } from "@/server/partners/auth";
import { toCsv } from "@/lib/hq/csv";
import { getStaffActivity, getStaffProfile } from "@/server/partners/staff";

/**
 * One staff member's activity, as CSV.
 *
 * A route rather than a server action because the browser has to download a
 * file, and it re-checks BOTH rules the page checks: the permission, and whose
 * record this is. A URL is guessable in a way a rendered page is not, and the
 * id in the path is exactly the part somebody would change.
 *
 * `hr.view_own` reads your own; anything else needs `hr.view_all`. 404, not
 * 403: whether a given staff id exists inside another partner is not something
 * this endpoint should confirm.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const partner = await getCurrentPartner();
  if (!partner || partner.status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  const isSelf = partner.user.id === id;
  const seesEveryone = partner.permissions.has("hr.view_all");
  if (!isSelf && !seesEveryone) return new Response("Not found", { status: 404 });
  if (isSelf && !partner.permissions.has("hr.view_own")) {
    return new Response("Not found", { status: 404 });
  }

  // Never includes the emergency contact: this file gets emailed around.
  const profile = await getStaffProfile(partner.id, id, { includeEmergency: false });
  if (!profile) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const day = (v: string | null, fallback: Date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? new Date(`${v}T00:00:00Z`) : fallback;
  const to = day(url.searchParams.get("to"), new Date());
  const from = day(
    url.searchParams.get("from"),
    new Date(Date.now() - 30 * 86_400_000),
  );

  const rows = await getStaffActivity(
    partner.id,
    { id, email: profile.email },
    { from, to: new Date(to.getTime() + 86_399_000) },
    5000,
  );

  const csv = toCsv(["when", "what", "kind", "source"], rows.map((r) => ({
    // ISO, not a localised string: this file is opened in Excel and re-sorted,
    // and "Sep 3" sorts before "Sep 20" alphabetically.
    when: r.at.toISOString(),
    what: r.detail,
    kind: r.kind,
    source: r.source,
  })));

  const name = (profile.name ?? profile.email).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${name}.csv"`,
    },
  });
}
