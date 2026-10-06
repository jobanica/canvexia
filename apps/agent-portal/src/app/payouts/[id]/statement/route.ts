import { NextResponse } from "next/server";
import { getSignedIn } from "@/server/auth";
import { agentDb, staffDb } from "@/server/scoped-db";
import { statementCsv } from "@/lib/payouts";

export const dynamic = "force-dynamic";

/** A payout statement as CSV. The agent's own (agentDb), or any for an admin. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await getSignedIn();
  if (!who) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const load = (tx: Parameters<Parameters<typeof agentDb>[1]>[0]) =>
    tx.agentPayout.findUnique({
      where: { id },
      include: { commissions: { orderBy: { createdAt: "asc" }, include: { referral: { select: { businessName: true, product: { select: { name: true } } } } } } },
    });
  const p =
    who.kind === "agent"
      ? await agentDb(who.agentId, load).catch(() => null)
      : who.role === "admin"
        ? await staffDb("admin", load).catch(() => null)
        : null;
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const period = p.period.toISOString().slice(0, 7);
  const csv = statementCsv(
    { period, total: p.total, referenceNumber: p.referenceNumber, method: p.method },
    p.commissions.map((c) => ({
      createdAt: c.createdAt.toISOString().slice(0, 10),
      customer: c.referral.businessName,
      product: c.referral.product.name,
      kind: c.kind,
      paidMonthNumber: c.paidMonthNumber,
      amount: c.amount,
    })),
  );
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payout-${period}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
