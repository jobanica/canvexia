import Link from "next/link";
import { PRODUCTS } from "@servd/core";
import { listPharmacies } from "@/server/pharmacy/queries";

export const dynamic = "force-dynamic";

/**
 * The index, and for now a development console rather than a product surface.
 *
 * It lists every pharmacy, which is a thing NO logged-in user should ever see —
 * it runs system-scoped precisely because there is no session yet. Wiring
 * Supabase Auth and `pharmacy_staff` is the next piece of work; until it lands,
 * this page says so rather than pretending otherwise.
 */
export default async function Home() {
  let pharmacies: Awaited<ReturnType<typeof listPharmacies>> = [];
  let dbError: string | null = null;
  try {
    pharmacies = await listPharmacies();
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Reseta</h1>
        <p className="mt-2 text-slate-600">
          {PRODUCTS.pharmacy.description} A CANVEXIA vertical.
        </p>
      </header>

      <section className="mb-10 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">No sign-in yet.</p>
        <p className="mt-1">
          Every pharmacy below is listed without a session, which is why this is a
          development console and not a product screen. Sign-in against{" "}
          <code className="rounded bg-amber-100 px-1">pharmacy_staff</code> is the
          next piece; the tenant queries behind each link already run scoped, so
          adding it changes who gets an id, not what the id can reach.
        </p>
      </section>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Pharmacies
      </h2>

      {dbError ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          Could not reach the database. Set <code>DATABASE_URL</code> and{" "}
          <code>DIRECT_URL</code>, then run{" "}
          <code>packages/db/prisma/manual/add-pharmacy-vertical.sql</code> and{" "}
          <code>pnpm --filter @servd/db db:rls</code>.
          <span className="mt-2 block font-mono text-xs opacity-70">{dbError}</span>
        </p>
      ) : pharmacies.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          None yet. A pharmacy is created by a partner through the CANVEXIA
          portal, which dispatches to this product&apos;s adapter — not by a form
          here.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {pharmacies.map((p) => (
            <li key={p.id}>
              <Link
                href={`/${p.slug}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-sm text-slate-500">/{p.slug}</span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  {!p.partnerId && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">
                      no partner
                    </span>
                  )}
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                    {p.status}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
