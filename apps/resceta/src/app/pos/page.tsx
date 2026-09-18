import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { catalogue } from "@/server/pharmacy/queries";
import { can } from "@/lib/pharmacy/roles";
import { peso } from "@/lib/money";
import { manilaDayBounds, manilaDayIso } from "@/lib/pharmacy/range";
import { branchContext, branchWhere } from "@/server/pharmacy/branches";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { IconReceipt } from "@/components/Icons";
import { Counter } from "./Counter";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Fpos");

  // Gated here as well as hidden from the nav. The nav is a convenience; this
  // is the check.
  if (!can(staff.role, "sell")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 text-sm text-slate-300">
            This account cannot ring up sales.
          </p>
        </main>
      </AppShell>
    );
  }

  const branch = await branchContext(staff.pharmacyId);
  const { start, end } = manilaDayBounds(manilaDayIso(new Date()));

  const [products, today, members, rates] = await Promise.all([
    catalogue(staff.pharmacyId, new Date(), branch),
    /*
      TODAY AT THIS TILL. Scoped to the chosen branch like everything else on
      this screen — a cashier at Toril reading the whole company's takings
      cannot reconcile their own drawer against it.
    */
    pharmacyDb(staff.pharmacyId, (tx) =>
      tx.pharmacySale.aggregate({
        where: {
          status: "completed",
          createdAt: { gte: start, lt: end },
          ...branchWhere(branch),
        },
        _count: { _all: true },
        _sum: { totalCentavos: true },
      }),
    ),
    /*
      The loyalty members, for the cart's search box. Sent with the page rather
      than fetched per keystroke: a counter is used at speed, and a round trip
      between typing a name and seeing it is a round trip the cashier waits for
      with a customer in front of them.
    */
    pharmacyDb(staff.pharmacyId, (tx) =>
      tx.pharmacyCustomer.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true, pointsBalance: true },
        take: 2000,
      }),
    ),
    pharmacyDb(staff.pharmacyId, (tx) =>
      tx.pharmacy.findUnique({
        where: { id: staff.pharmacyId },
        select: { loyaltyCentavosPerPoint: true },
      }),
    ),
  ]);

  const count = today._count._all;
  const takings = today._sum.totalCentavos ?? 0;
  const branchName = branch.all ? "All branches" : (branch.current?.name ?? "Main Branch");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Point of Sale</h1>
            <p className="mt-1 text-sm text-slate-300">
              Selling from {branchName}. Today: {count} sale{count === 1 ? "" : "s"},{" "}
              {peso(takings)}.
            </p>
          </div>
          <Link
            href="/receipts"
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            <IconReceipt className="h-4 w-4" />
            Receipts
          </Link>
        </div>

        {staff.pharmacyStatus !== "active" ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            This pharmacy cannot dispense yet.
          </p>
        ) : (
          <Counter
            vatRatePct={staff.vatRatePct}
            products={products}
            canDispenseRx={can(staff.role, "dispenseRx")}
            branchName={branchName}
            members={members}
            loyaltyCentavosPerPoint={rates?.loyaltyCentavosPerPoint ?? 0}
          />
        )}
      </main>
    </AppShell>
  );
}
