import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { receiptFor } from "@/server/pharmacy/receipt";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { EscPos, columnsFor } from "@/lib/pharmacy/escpos";
import { pharmacyDb } from "@/server/tenancy/scoped-db";

export const dynamic = "force-dynamic";

/**
 * A RECEIPT, AS BYTES A THERMAL PRINTER UNDERSTANDS.
 *
 * The browser cannot build this: the money formatting, the VAT box and the
 * licence numbers belong on the server, where the HTML receipt already gets
 * them. The page's job is only to push the bytes at the device it is paired
 * with.
 *
 * SCOPED LIKE EVERY OTHER READ. The pharmacy comes from the session, so a sale
 * id belonging to somebody else is simply not found.
 */
export async function GET(req: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(staff.role, "sell")) return new NextResponse("Not allowed.", { status: 403 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("type");
  const id = url.searchParams.get("id") ?? "";

  const shop = await pharmacyDb(staff.pharmacyId, (tx) =>
    tx.pharmacy.findUnique({
      where: { id: staff.pharmacyId },
      select: { receiptPaperMm: true, receiptHeader: true, receiptFooter: true },
    }),
  );
  const w = columnsFor(shop?.receiptPaperMm ?? 58);

  if (kind === "receipt") {
    const doc = await receiptFor(staff.pharmacyId, id);
    if (!doc) return new NextResponse("Not found.", { status: 404 });

    const p = new EscPos().init().align("center").bold(true).line(doc.title).bold(false);
    if (doc.identity.address) p.line(doc.identity.address);
    if (doc.identity.phone) p.line(doc.identity.phone);
    if (doc.identity.tin) p.line(`TIN ${doc.identity.tin}`);
    if (doc.identity.fdaLtoNumber) p.line(`LTO ${doc.identity.fdaLtoNumber}`);
    if (doc.identity.prcLicenseNo) p.line(`PRC ${doc.identity.prcLicenseNo}`);
    if (shop?.receiptHeader) p.line(shop.receiptHeader);

    /*
      A VOIDED SALE SAYS SO, LOUDLY. Printing one that reads like a receipt is
      handing a customer proof of a sale that was reversed.
    */
    if (doc.voided) p.feed(1).bold(true).line("*** VOIDED ***").bold(false);
    // Equally: a document missing something the law requires is not an official
    // receipt, and the paper must not pretend otherwise.
    if (!doc.isOfficial) p.feed(1).line("NOT AN OFFICIAL RECEIPT");

    p.feed(1).align("left").rule(w);
    p.line(`No. ${doc.receiptNumber}`);
    p.line(manilaDate(doc.issuedAt));
    if (doc.soldBy) p.line(`Served by ${doc.soldBy}`);
    p.rule(w);

    for (const l of doc.lines) {
      p.line(l.nameAtTime);
      p.row(`  ${l.quantity} x ${peso(l.unitPriceCentavos)}`, peso(l.lineTotalCentavos), w);
    }

    p.rule(w);
    for (const row of doc.summary) {
      const amount = row.kind === "deduction" ? `-${peso(row.centavos)}` : peso(row.centavos);
      if (row.kind === "due") p.bold(true).row(row.label, amount, w).bold(false);
      else p.row(row.label, amount, w);
      if (row.note) p.line(`  ${row.note}`);
    }

    p.rule(w);
    p.row(doc.payment.method.toUpperCase(), peso(doc.payment.tenderedCentavos), w);
    p.row("CHANGE", peso(doc.payment.changeCentavos), w);

    if (doc.vat) {
      p.rule(w);
      p.row("VATable", peso(doc.vat.vatableSalesCentavos), w);
      p.row("VAT", peso(doc.vat.vatCentavos), w);
      p.row("VAT exempt", peso(doc.vat.vatExemptCentavos), w);
      p.row("Zero rated", peso(doc.vat.zeroRatedCentavos), w);
    }

    if (doc.beneficiary) {
      p.rule(w);
      p.line(doc.beneficiary.label);
      if (doc.beneficiary.name) p.line(`  ${doc.beneficiary.name}`);
      // The ID is what makes the discount defensible, so it prints on the copy
      // the customer keeps as well as in the logbook.
      if (doc.beneficiary.idNo) p.line(`  ID ${doc.beneficiary.idNo}`);
    }

    if (doc.prescriptionRef) {
      p.rule(w);
      p.line(`Rx ${doc.prescriptionRef}`);
    }

    p.feed(1).align("center");
    if (shop?.receiptFooter) p.line(shop.receiptFooter);
    p.line("Thank you");

    return new NextResponse(new Uint8Array(p.cut().bytes()), {
      headers: {
        "Content-Type": "application/octet-stream",
        // Never cached: a receipt is a one-off and a stale one is somebody
        // else's sale.
        "Cache-Control": "no-store",
      },
    });
  }

  if (kind === "reading") {
    const r = await pharmacyDb(staff.pharmacyId, (tx) =>
      tx.pharmacyReading.findFirst({
        where: { id },
        select: {
          zCounter: true,
          openedAt: true,
          closedAt: true,
          openingCashCentavos: true,
          salesCount: true,
          voidedCount: true,
          grossCentavos: true,
          discountCentavos: true,
          netCentavos: true,
          vatableCentavos: true,
          vatCentavos: true,
          vatExemptCentavos: true,
          zeroRatedCentavos: true,
          cashCentavos: true,
          cardCentavos: true,
        },
      }),
    );
    if (!r) return new NextResponse("Not found.", { status: 404 });

    const p = new EscPos().init().align("center").bold(true);
    p.line(`Z-READING ${r.zCounter ?? ""}`).bold(false);
    p.align("left").rule(w);
    p.line(`Opened ${manilaDate(r.openedAt)}`);
    p.line(`Closed ${manilaDate(r.closedAt)}`);
    p.rule(w);
    p.row("Sales", String(r.salesCount), w);
    p.row("Voided", String(r.voidedCount), w);
    p.row("Gross", peso(r.grossCentavos), w);
    p.row("Discounts", `-${peso(r.discountCentavos)}`, w);
    p.bold(true).row("NET SALES", peso(r.netCentavos), w).bold(false);
    p.rule(w);
    p.row("VATable", peso(r.vatableCentavos), w);
    p.row("VAT", peso(r.vatCentavos), w);
    p.row("VAT exempt", peso(r.vatExemptCentavos), w);
    p.row("Zero rated", peso(r.zeroRatedCentavos), w);
    p.rule(w);
    p.row("Cash", peso(r.cashCentavos), w);
    p.row("Card / e-wallet", peso(r.cardCentavos), w);
    p.row("Opening drawer", peso(r.openingCashCentavos), w);
    p.feed(2).line("Counted by ____________________");
    p.feed(1).line("Verified by ____________________");
    p.feed(1).align("center").line("Reprint does not close a shift");

    return new NextResponse(new Uint8Array(p.cut().bytes()), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
    });
  }

  return new NextResponse("Unknown document.", { status: 400 });
}
