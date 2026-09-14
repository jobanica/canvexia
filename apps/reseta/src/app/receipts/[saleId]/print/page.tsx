import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { receiptFor } from "@/server/pharmacy/receipt";
import { can } from "@/lib/pharmacy/roles";
import { ReceiptPaper } from "@/components/ReceiptPaper";
import { AutoPrint, PrintButton } from "./AutoPrint";

export const dynamic = "force-dynamic";

/**
 * The receipt on its own, with nothing else on the page.
 *
 * No AppShell: a nav bar down the side of a thermal roll is wasted paper, and
 * `display: none` on print is one stylesheet change away from not working. The
 * simplest way for the chrome not to print is for the page not to have any.
 */
export default async function PrintReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Freceipts");
  if (!can(staff.role, "sell")) redirect("/");

  const { saleId } = await params;
  const { auto } = await searchParams;

  // Scoped: another pharmacy's receipt is not found, not forbidden.
  const doc = await receiptFor(staff.pharmacyId, saleId);
  if (!doc) notFound();

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div
        data-print-hide
        className="mx-auto mb-6 flex max-w-[302px] flex-wrap items-center gap-3 px-3"
      >
        <Link href={`/receipts/${saleId}`} className="text-sm text-slate-500 hover:underline">
          ← receipt
        </Link>
        <div className="ml-auto">
          <PrintButton />
        </div>
      </div>

      {!doc.isOfficial && (
        <div
          data-print-hide
          className="mx-auto mb-6 max-w-[302px] rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <p className="font-semibold">This is not an official receipt yet.</p>
          <ul className="mt-2 space-y-1">
            {doc.gaps.map((gap) => (
              <li key={gap.field}>
                <strong>{gap.label}</strong> — {gap.why}
              </li>
            ))}
          </ul>
          {can(staff.role, "manageSettings") && (
            <Link href="/settings" className="mt-2 inline-block font-medium underline">
              Fill these in
            </Link>
          )}
        </div>
      )}

      <div className="shadow-sm print:shadow-none">
        <ReceiptPaper doc={doc} />
      </div>

      {auto === "1" && <AutoPrint />}
    </div>
  );
}
