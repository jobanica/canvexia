import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { PrintNow } from "@/app/purchase-orders/[id]/print/PrintNow";

export const dynamic = "force-dynamic";

/**
 * A TEST SLIP, so somebody can find out whether the printer works before a
 * customer is waiting.
 *
 * IT IS NOT A RECEIPT and says so on its face. A test print that looks like a
 * receipt is a test print that ends up in a drawer being counted, and it
 * carries no receipt number because it is not part of the series.
 *
 * WHAT THIS ACTUALLY TESTS is the whole chain a real receipt takes: this app
 * renders a page, the browser opens its print dialog, and the operating system
 * sends it to whichever printer the device has. There is no network printer
 * connection in this software to configure — that is the point of the page.
 */
export default async function TestPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ auto?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (!can(staff.role, "sell")) redirect("/");

  const { auto } = await searchParams;
  const shop = await pharmacyDb(staff.pharmacyId, (tx) =>
    tx.pharmacy.findUnique({
      where: { id: staff.pharmacyId },
      select: {
        displayName: true,
        name: true,
        address: true,
        tin: true,
        receiptPaperMm: true,
        receiptHeader: true,
        receiptFooter: true,
      },
    }),
  );

  const mm = shop?.receiptPaperMm ?? 58;
  const width = mm === 80 ? "302px" : "226px";

  return (
    <div className="min-h-screen bg-slate-100 py-6 text-black print:bg-white print:py-0">
      <div
        data-print-hide
        className="mx-auto mb-6 max-w-[302px] px-3 print:hidden"
      >
        <Link href="/settings" className="text-sm text-slate-600 hover:underline">
          ← settings
        </Link>
        <div className="mt-3">
          <PrintNow auto={auto === "1"} />
        </div>
        <div className="mt-4 rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-700">
          <p className="font-semibold">If this comes out wrong</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              Set the paper size in the print dialog to your roll ({mm}mm), not A4.
            </li>
            <li>Turn OFF headers and footers, or the page number prints on the roll.</li>
            <li>Set margins to none, and scale to 100%.</li>
            <li>
              If the width is wrong on the roll itself, change it in{" "}
              <Link href="/settings" className="underline">
                settings
              </Link>{" "}
              — it is set to {mm}mm now.
            </li>
          </ul>
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
          {shop?.receiptHeader && <p className="mt-1">{shop.receiptHeader}</p>}
          <p className="mt-2 font-bold">*** TEST PRINT ***</p>
          <p>NOT A RECEIPT — NOT A SALE</p>
        </div>

        <div className="my-2 border-t border-dashed border-black/50" />
        <p>{manilaDate(new Date())}</p>
        <p>Paper set to {mm}mm</p>

        <div className="my-2 border-t border-dashed border-black/50" />

        {/* Real-looking columns, so the alignment being tested is the one a
            receipt actually uses. */}
        <div className="flex justify-between">
          <span>Sample item 500mg</span>
          <span className="tabular-nums">{peso(12345)}</span>
        </div>
        <div className="flex justify-between">
          <span>&nbsp;&nbsp;2 x {peso(6172)}</span>
          <span />
        </div>
        <div className="flex justify-between">
          <span>A longer product name to test wrapping</span>
          <span className="tabular-nums">{peso(98700)}</span>
        </div>

        <div className="my-2 border-t border-dashed border-black/50" />
        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span className="tabular-nums">{peso(111045)}</span>
        </div>

        <div className="my-2 border-t border-dashed border-black/50" />
        <p className="text-center">1234567890 ABCDEFGHIJ</p>
        <p className="text-center">The quick brown fox jumps over</p>
        {shop?.receiptFooter && <p className="mt-2 text-center">{shop.receiptFooter}</p>}
        <p className="mt-2 text-center font-bold">*** END OF TEST ***</p>
      </div>
    </div>
  );
}
