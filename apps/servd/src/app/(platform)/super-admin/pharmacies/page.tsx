import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { listPharmacies } from "@/server/pharmacies/hq";
import { manilaDate } from "@/lib/time/manila";
import { ActivateButton } from "./ActivateButton";

/**
 * Resceta pharmacies, and switching one on (D36's rule, HQ's button — D38).
 * Activation is refused until the pharmacy has recorded its FDA Licence to
 * Operate in Resceta → Settings.
 */
export default async function PharmaciesPage() {
  await requireSuperAdminPage();
  const rows = await listPharmacies();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Pharmacies</h1>
        <p className="text-sm text-plum-ink/50">
          A pharmacy starts pending and cannot dispense until it is activated here — which needs its FDA
          Licence to Operate on file. Each activation is recorded in the audit log with the licence number.
        </p>
      </div>
      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No pharmacies yet.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{p.name} <span className="ml-1 text-xs text-plum-ink/50">{p.status}</span></p>
                  <p className="text-xs text-plum-ink/45">
                    Signed up {manilaDate(p.createdAt)} · FDA LTO {p.fdaLtoNumber ? <span className="font-mono">{p.fdaLtoNumber}</span> : "not on file"}
                  </p>
                </div>
                {p.activation.ok ? (
                  <ActivateButton pharmacyId={p.id} />
                ) : (
                  <span className="max-w-xs text-right text-xs text-plum-ink/50">{p.activation.message}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
