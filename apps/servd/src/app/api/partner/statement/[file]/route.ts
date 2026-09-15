import { getCurrentPartner } from "@/server/partners/auth";
import { can } from "@servd/core";
import { getStatement, statementCsv } from "@/server/partners/revenue";

/**
 * A statement as CSV.
 *
 * A route rather than a server action because the browser has to download a
 * file, and it re-checks the session AND the capability: a URL is guessable in
 * a way a rendered page is not, and `revenue.read` is the whole point of this
 * endpoint existing separately from the page.
 *
 * `getStatement` reads through partnerDb, so a month belonging to another
 * partner is not addressable here at all — there is no partner id in the URL to
 * tamper with.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const partner = await getCurrentPartner();
  if (!partner || !can(partner.user.role, "revenue.read")) {
    return new Response("Not found", { status: 404 });
  }

  const { file } = await params;
  const month = file.replace(/\.csv$/i, "");
  const statement = await getStatement(partner.id, month);
  if (!statement) return new Response("Not found", { status: 404 });

  return new Response(statementCsv(statement), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="canvexia-statement-${month}.csv"`,
      // A statement is per-partner and per-session; a shared cache holding one
      // is a statement served to the wrong operator.
      "Cache-Control": "private, no-store",
    },
  });
}
