import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listCatalogue, listCategories } from "@/server/pharmacy/catalogue";
import { can } from "@/lib/pharmacy/roles";
import { CatalogueTable } from "./CatalogueTable";

export const dynamic = "force-dynamic";

/**
 * THE CATALOGUE.
 *
 * Until this page existed, a product could be created in exactly one place —
 * inline while receiving a delivery — which set two of its sixteen columns, and
 * nothing anywhere could edit one afterwards. The consequences were not
 * cosmetic:
 *
 *   `requiresPrescription` was read in six places and written in none, so the
 *   statutory rule that only a pharmacist may dispense an Rx medicine was
 *   enforced perfectly against a flag that could never be true.
 *
 *   `reorderPoint` defaulted to 0, so the dashboard's low-stock list could only
 *   fire once an item had run out.
 *
 *   A price could never be corrected.
 *
 * `manageCatalogue` is the gate, and it was another permission with no screen:
 * owner and manager have held it since the role table was written and had
 * nothing to manage. Checked here as well as filtered out of the nav — the nav
 * is a convenience, this is the check.
 */
export default async function CataloguePage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Fcatalogue");

  if (!can(staff.role, "manageCatalogue")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Only an owner or manager can change the catalogue. A pharmacist can receive stock into
            it from <strong>Receive</strong>.
          </p>
        </main>
      </AppShell>
    );
  }

  const [products, categories] = await Promise.all([
    listCatalogue(staff.pharmacyId),
    listCategories(staff.pharmacyId),
  ]);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Catalogue</h1>
        <p className="mb-8 text-sm text-slate-500">
          What the counter can sell, what it costs, and which items need a pharmacist.
        </p>
        <CatalogueTable products={products} categories={categories} />
      </main>
    </AppShell>
  );
}
