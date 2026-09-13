import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { listBranches } from "@/server/tenancy/branches";
import { switchBranch } from "@/server/tenancy/branch-actions";
import { AddBranchForm } from "@/components/admin/AddBranchForm";
import { ActivateBranchButton } from "@/components/admin/ActivateBranchButton";
import { ACTIVATION_PRICE } from "@/server/build/queries";
import { formatPeso } from "@/lib/money";

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Live ✓", cls: "bg-mango/15 text-mango" },
  pending: { label: "Not activated", cls: "bg-plum-ink/5 text-plum-ink/55" },
  preview: { label: "Preview", cls: "bg-plum-ink/5 text-plum-ink/55" },
  suspended: { label: "Suspended", cls: "bg-guava/15 text-guava" },
  archived: { label: "Archived", cls: "bg-plum-ink/5 text-plum-ink/40" },
};

/**
 * One account, several shops.
 *
 * Each branch is a separate restaurant — its own menu, orders, staff, takings
 * and paid unlocks. Nothing is pooled between them, deliberately: two branches
 * are two businesses that happen to share an owner. What makes them one account
 * is that this login is staff at each, and can swap between them here.
 */
export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string }>;
}) {
  const { activated } = await searchParams;
  const user = await requireAdminPage();
  const branches = await listBranches(user.authUserId, user.restaurantId);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Branches</h1>
        <p className="text-sm text-plum-ink/50">
          Run every shop from this one login. Switching changes what the whole dashboard shows —
          orders, menu, staff and reports.
        </p>
      </div>

      {activated && (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink/80">
          Payment received — thanks. The branch switches to <strong>Live</strong> as soon as Xendit
          confirms it, usually within a minute. Refresh if it still says not activated.
        </div>
      )}

      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <p className="mb-3 text-sm font-semibold">
          Your branches{branches.length > 0 && ` (${branches.length})`}
        </p>
        {branches.length === 0 ? (
          <p className="text-sm text-plum-ink/55">No branches found for this login.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {branches.map((b) => {
              const s = STATUS[b.status] ?? STATUS.pending;
              return (
                <li key={b.restaurantId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{b.name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
                        {s.label}
                      </span>
                      {b.active && (
                        <span className="shrink-0 rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-primary">
                          You&apos;re here
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-plum-ink/45">/{b.slug}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {b.status !== "active" && (
                      <ActivateBranchButton
                        restaurantId={b.restaurantId}
                        price={formatPeso(ACTIVATION_PRICE)}
                      />
                    )}
                    {/* Switching is only offered once the branch is live. The
                        server refuses it either way — an unactivated branch has
                        nothing to run, so entering it looks like a broken app
                        rather than an unpaid one. */}
                    {!b.active && b.status === "active" && (
                      <form action={switchBranch}>
                        <input type="hidden" name="restaurantId" value={b.restaurantId} />
                        <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold hover:bg-cream">
                          Switch to this branch
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {branches.length === 1 && (
        <p className="text-sm text-plum-ink/55">
          Just the one shop so far. Add a branch below and a switcher appears here and in the
          sidebar.
        </p>
      )}

      <AddBranchForm activationPrice={formatPeso(ACTIVATION_PRICE)} />

      <p className="text-xs text-plum-ink/45">
        Paid features are bought per branch. An unlock on one shop applies to that shop — its
        kitchen, its stock, its staff — so each branch only pays for what it actually uses.
      </p>
    </div>
  );
}
