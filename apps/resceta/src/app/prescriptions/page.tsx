import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { customerOptions, listPrescriptions } from "@/server/pharmacy/prescriptions";
import { ageInDays } from "@/lib/pharmacy/prescription-input";
import { manilaDayIso } from "@/lib/pharmacy/range";
import { can } from "@/lib/pharmacy/roles";
import { manilaDate } from "@/lib/money";
import { PrescriptionForm } from "./PrescriptionForm";

export const dynamic = "force-dynamic";

/**
 * Prescriptions on file.
 *
 * Searchable by patient, prescriber, PRC number or Rx number — which is the
 * only reason to keep them. A list that can only be read in date order answers
 * none of the questions an inspection asks.
 */
export default async function PrescriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const { q } = await searchParams;
  const [rows, customers] = await Promise.all([
    listPrescriptions(staff.pharmacyId, q),
    can(staff.role, "sell") ? customerOptions(staff.pharmacyId) : Promise.resolve([]),
  ]);

  const now = new Date();

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Prescriptions</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          The paper Rx is the legal document. These are the records that make one
          findable afterwards.
        </p>

        <form method="get" className="mb-6 flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Patient, prescriber, PRC number or Rx number"
            className="w-full max-w-md rounded-xl border border-white/10 px-3 py-2 text-sm"
          />
          <button className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl px-4 py-2 text-sm font-medium">
            Search
          </button>
          {q && (
            <Link href="/prescriptions" className="self-center text-sm text-slate-500 underline">
              Clear
            </Link>
          )}
        </form>

        {can(staff.role, "sell") && (
          <div className="mb-8">
            {/* Keyed on the row count so a successful save clears the fields
                for the next one — the new row below is the confirmation. */}
            <PrescriptionForm
              key={`rx-${rows.length}`}
              customers={customers}
              today={manilaDayIso(now)}
            />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            {q ? "Nothing matches that search." : "No prescriptions recorded yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
              <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Patient</th>
                  <th className="px-4 py-2 font-medium">Prescriber</th>
                  <th className="px-4 py-2 font-medium">Dated</th>
                  <th className="px-4 py-2 font-medium">Rx no.</th>
                  <th className="px-4 py-2 text-right font-medium">Dispensed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((rx) => {
                  const age = ageInDays(rx.dateIssued, now);
                  return (
                    <tr key={rx.id}>
                      <td className="px-4 py-2">
                        {rx.customerId ? (
                          <Link href={`/customers/${rx.customerId}`} className="font-medium underline">
                            {rx.patientName}
                          </Link>
                        ) : (
                          <span className="font-medium">{rx.patientName}</span>
                        )}
                        {rx.customerName && rx.customerName !== rx.patientName && (
                          <p className="text-xs text-slate-500">on {rx.customerName}&rsquo;s record</p>
                        )}
                        {rx.notes && <p className="text-xs text-slate-500">{rx.notes}</p>}
                      </td>
                      <td className="px-4 py-2 text-slate-300">
                        {rx.doctorName}
                        {rx.doctorPrcNo ? (
                          <p className="font-mono text-xs text-slate-500">PRC {rx.doctorPrcNo}</p>
                        ) : (
                          <p className="text-xs text-amber-300">No PRC number recorded</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {manilaDate(rx.dateIssued)}
                        {/*
                          The age, not a verdict. How long a prescription
                          remains dispensable depends on what is on it; the app
                          shows the number so the pharmacist can decide, which
                          is the difference between a tool and a liability.
                        */}
                        <p className="text-xs text-slate-500">
                          {age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} old`}
                        </p>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {rx.rxNumber ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{rx.dispensings}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}
