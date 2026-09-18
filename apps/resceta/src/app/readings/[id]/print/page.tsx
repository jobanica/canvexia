import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { PrintNow } from "@/app/purchase-orders/[id]/print/PrintNow";

export const dynamic = "force-dynamic";

/**
 * THE Z-READING AS A SLIP.
 *
 * A till is closed at the end of a shift and the reading is what the drawer is
 * reconciled against — the cash counted, what was expected, and the split of
 * the day's takings. It belongs on paper, in the drawer, beside the money.
 *
 * NO APP SHELL, and laid out for a 58mm roll: this prints on the receipt
 * printer, next to the till, not on office paper.
 */
export default async function PrintReadingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  // Whoever closed the drawer may print what they just closed.
  if (!can(staff.role, "sell")) redirect("/");

  const { id } = await params;
  const { auto } = await searchParams;

  const [r, shop] = await Promise.all([
    // Scoped: another pharmacy's reading is not found, not forbidden.
    pharmacyDb(staff.pharmacyId, (tx) =>
      tx.pharmacyReading.findFirst({
        where: { id },
        select: {
          id: true,
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
          branchId: true,
          staffId: true,
        },
      }),
    ),
    pharmacyDb(staff.pharmacyId, (tx) =>
      tx.pharmacy.findUnique({
        where: { id: staff.pharmacyId },
        select: {
          displayName: true,
          name: true,
          address: true,
          tin: true,
          birPermitNo: true,
          posSerialNo: true,
          receiptPaperMm: true,
        },
      }),
    ),
  ]);
  if (!r) notFound();

  /*
    The reading row carries ids, not relations — it is a SNAPSHOT, and a branch
    renamed or a cashier removed afterwards must not change what the slip says
    about a closed shift. So the names are looked up separately and fall back to
    the id's absence rather than failing the print.
  */
  const [branch, cashier] = await Promise.all([
    r.branchId
      ? pharmacyDb(staff.pharmacyId, (tx) =>
          tx.pharmacyBranch.findFirst({ where: { id: r.branchId! }, select: { name: true } }),
        )
      : null,
    r.staffId
      ? pharmacyDb(staff.pharmacyId, (tx) =>
          tx.pharmacyStaff.findFirst({
            where: { id: r.staffId! },
            select: { displayName: true, email: true },
          }),
        )
      : null,
  ]);

  const width = shop?.receiptPaperMm === 80 ? "302px" : "226px";
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-6 text-black print:bg-white print:py-0">
      <div
        data-print-hide
        className="mx-auto mb-6 flex max-w-[302px] items-center gap-3 px-3 print:hidden"
      >
        <Link href="/readings" className="text-sm text-slate-600 hover:underline">
          ← readings
        </Link>
        <div className="ml-auto">
          <PrintNow auto={auto === "1"} />
        </div>
      </div>

      <div
        className="mx-auto bg-white p-3 font-mono text-[11px] leading-snug shadow-sm print:shadow-none"
        style={{ width }}
      >
        <div className="text-center">
          <p className="text-sm font-bold">{shop?.displayName ?? shop?.name ?? ""}</p>
          {shop?.address && <p>{shop.address}</p>}
          {shop?.tin && <p>TIN {shop.tin}</p>}
          {shop?.birPermitNo && <p>PERMIT {shop.birPermitNo}</p>}
          {shop?.posSerialNo && <p>SN {shop.posSerialNo}</p>}
          <p className="mt-2 font-bold">Z-READING {r.zCounter ?? ""}</p>
          {branch?.name && <p>{branch.name}</p>}
        </div>

        <div className="my-2 border-t border-dashed border-black/50" />

        <Row label="Opened" value={manilaDate(r.openedAt)} />
        <Row label="Closed" value={manilaDate(r.closedAt)} />
        <Row label="Cashier" value={cashier?.displayName ?? cashier?.email ?? "—"} />

        <div className="my-2 border-t border-dashed border-black/50" />

        <Row label="Sales" value={String(r.salesCount)} />
        {/*
          Voided sales are COUNTED and contribute no money. A reading that hides
          them is a reading that cannot be checked against the receipt series.
        */}
        <Row label="Voided" value={String(r.voidedCount)} />
        <Row label="Gross" value={peso(r.grossCentavos)} />
        <Row label="Discounts" value={`-${peso(r.discountCentavos)}`} />
        <Row label="NET SALES" value={peso(r.netCentavos)} strong />

        <div className="my-2 border-t border-dashed border-black/50" />

        <Row label="VATable" value={peso(r.vatableCentavos)} />
        <Row label="VAT" value={peso(r.vatCentavos)} />
        <Row label="VAT exempt" value={peso(r.vatExemptCentavos)} />
        <Row label="Zero rated" value={peso(r.zeroRatedCentavos)} />

        <div className="my-2 border-t border-dashed border-black/50" />

        <Row label="Cash" value={peso(r.cashCentavos)} />
        <Row label="Card / e-wallet" value={peso(r.cardCentavos)} />

        <div className="my-2 border-t border-dashed border-black/50" />

        <Row label="Opening drawer" value={peso(r.openingCashCentavos)} />
        <p className="mt-4">Counted by ______________________</p>
        <p className="mt-3">Verified by ______________________</p>

        <p className="mt-4 text-center">
          {/* Said on the slip, because a Z-reading is the record of a closed
              shift and reprinting one should never look like closing another. */}
          Reprint of Z-reading {r.zCounter ?? ""} — this does not close a shift.
        </p>
      </div>
    </div>
  );
}
