import { getCurrentPartner } from "@/server/partners/auth";
import { toCsv } from "@/lib/hq/csv";
import { attendanceWeek, lastSevenDays } from "@/server/partners/attendance";

/**
 * The week's attendance, as CSV. `attendance.view_all` only.
 *
 * One row per person per day rather than one per person: a wide sheet with a
 * column per date cannot be filtered or pivoted, and the first thing anybody
 * does with an attendance export is pivot it.
 */
export async function GET(req: Request) {
  const partner = await getCurrentPartner();
  if (
    !partner ||
    partner.status !== "approved" ||
    !partner.permissions.has("attendance.view_all")
  ) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const days = lastSevenDays();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range =
    from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? days.filter((d) => d >= from && d <= to)
      : days;

  const week = await attendanceWeek(partner.id, range.length > 0 ? range : days);

  const rows = week.flatMap((s) =>
    s.days.map((d) => ({
      person: s.name,
      day: d.dayKey,
      first_in: d.firstIn ? d.firstIn.toISOString() : "",
      last_out: d.lastOut ? d.lastOut.toISOString() : "",
      auto_closed: d.autoClosed ? "yes" : "",
      visits: d.visits,
      // Joined with a semicolon, not a comma: this is a CSV cell.
      flags: d.flags.join("; "),
    })),
  );

  return new Response(
    toCsv(["person", "day", "first_in", "last_out", "auto_closed", "visits", "flags"], rows),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="attendance.csv"',
      },
    },
  );
}
