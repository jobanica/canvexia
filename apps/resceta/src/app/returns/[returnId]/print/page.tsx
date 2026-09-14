import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { creditNoteFor } from "@/server/pharmacy/credit-note";
import { can } from "@/lib/pharmacy/roles";
import { CreditNotePaper } from "@/components/CreditNotePaper";
import { AutoPrint, PrintButton } from "@/app/receipts/[saleId]/print/AutoPrint";

export const dynamic = "force-dynamic";

/**
 * The credit note on its own page, for the same reason the receipt has one: the
 * simplest way for the chrome not to print is for the page not to have any.
 */
export default async function PrintCreditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ returnId: string }>;
  searchParams: Promise<{ auto?: string; from?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Freceipts");
  if (!can(staff.role, "sell")) redirect("/");

  const { returnId } = await params;
  const { auto, from } = await searchParams;

  // Scoped: another pharmacy's credit note is not found, not forbidden.
  const doc = await creditNoteFor(staff.pharmacyId, returnId);
  if (!doc) notFound();

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div
        data-print-hide
        className="mx-auto mb-6 flex max-w-[302px] flex-wrap items-center gap-3 px-3"
      >
        <Link
          href={from ? `/receipts/${from}` : "/receipts"}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {from ? "receipt" : "receipts"}
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
          <p className="font-semibold">This is not an official credit note yet.</p>
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
        <CreditNotePaper doc={doc} />
      </div>

      {auto === "1" && <AutoPrint />}
    </div>
  );
}
