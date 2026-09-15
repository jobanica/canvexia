import { NextRequest, NextResponse } from "next/server";
import { hqCan } from "@servd/core";
import { getCurrentHqUser } from "@/server/hq/auth";
import { searchLedger } from "@/server/hq/billing";
import { toCsv } from "@/lib/hq/csv";

/** The ledger explorer's export. Gated here: a route handler runs outside the layout. */
export async function GET(req: NextRequest) {
  const user = await getCurrentHqUser();
  if (!user || !hqCan(user.role, "billing.run")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const p = req.nextUrl.searchParams;
  const rows = await searchLedger({
    partnerId: p.get("partner") ?? undefined,
    merchantId: p.get("merchant") ?? undefined,
    kind: p.get("kind") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    limit: 5000,
  });

  const csv = toCsv(
    ["occurredAt", "partner", "productId", "merchantId", "kind", "providerRef",
     "grossCentavos", "partnerCentavos", "hqCentavos", "sharePct", "reason", "actor"],
    rows.map((r) => ({
      occurredAt: r.occurredAt.toISOString(),
      partner: r.partnerName,
      productId: r.productId,
      merchantId: r.merchantId,
      kind: r.kind,
      providerRef: r.providerRef,
      // CENTAVOS in the export, and the header says so. Exporting pesos would
      // invite somebody to sum a column that has been rounded twice.
      grossCentavos: r.grossAmount,
      partnerCentavos: r.partnerAmount,
      hqCentavos: r.hqAmount,
      sharePct: r.sharePct,
      reason: r.adjustmentReason ?? "",
      actor: r.actorEmail ?? "",
    })),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="canvexia-ledger-${stamp}.csv"`,
    },
  });
}
