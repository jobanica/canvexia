import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getPartnersOverview } from "@/server/partners/admin-queries";
import { setPartnerStatus } from "@/server/partners/admin";
import { getPartnerTrainingUrl } from "@/server/partners/portal";
import { PartnerTrainingForm } from "@/components/super-admin/PartnerTrainingForm";
import { PartnerOperatorForm } from "@/components/super-admin/PartnerOperatorForm";

const STATUS_CLS: Record<string, string> = {
  pending: "bg-plum-ink/5 text-plum-ink/60",
  approved: "bg-mango/15 text-mango",
  suspended: "bg-guava/15 text-guava",
  rejected: "bg-guava/15 text-guava",
};

export default async function SuperAdminPartnersPage() {
  await requireSuperAdminPage();
  const { partners } = await getPartnersOverview();
  const trainingUrl = await getPartnerTrainingUrl();
  const pending = partners.filter((p) => p.status === "pending");
  const active = partners.filter((p) => p.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Partners</h1>
        <p className="text-sm text-plum-ink/50">
          Applications, approvals, and how many restaurants each partner has set up.
        </p>
      </div>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">Partner training video</h2>
        <p className="mb-3 text-sm text-plum-ink/50">
          Shown to every approved partner on their dashboard so they can learn the system and start
          selling right away.
        </p>
        <PartnerTrainingForm current={trainingUrl} />
      </section>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">Applications ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No pending applications.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{p.name} · <span className="text-plum-ink/50">{p.tier}</span></p>
                  <p className="text-xs text-plum-ink/45">{p.email}</p>
                </div>
                <div className="flex gap-2">
                  <form action={setPartnerStatus}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value="approved" />
                    <button className="rounded-lg px-3 py-1.5 text-xs font-semibold btn-brand">Approve</button>
                  </form>
                  <form action={setPartnerStatus}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Reject</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">Partners</h2>
        {active.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No active partners yet.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {active.map((p) => (
              <li key={p.id} className="space-y-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {p.name}{" "}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[p.status] ?? ""}`}>
                        {p.status}
                      </span>
                      {p.tier === "operator" && (
                        <span className="ml-1 rounded-full bg-mango/15 px-2 py-0.5 text-xs font-semibold text-mango">
                          {p.revenueSharePct}% share
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-plum-ink/45">
                      {p.email} · {p.tier}
                      {p.territory ? ` · ${p.territory}` : ""} ·{" "}
                      {p.accounts === 0
                        ? "no restaurants yet"
                        : `${p.accounts} restaurant${p.accounts === 1 ? "" : "s"} · ${p.live} live`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={setPartnerStatus}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="status" value={p.status === "suspended" ? "approved" : "suspended"} />
                      <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                        {p.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>
                    </form>
                  </div>
                </div>
                <details className="rounded-lg border border-plum-ink/10 bg-plum-ink/[0.02] p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-plum-ink/50">
                    Operator terms
                  </summary>
                  <div className="pt-3">
                    <PartnerOperatorForm
                      partner={{
                        id: p.id,
                        name: p.name,
                        tier: p.tier,
                        territory: p.territory,
                        slug: p.slug,
                        revenueSharePct: p.revenueSharePct,
                        collectionMode: p.collectionMode,
                        brandMode: p.brandMode,
                      }}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-plum-ink/40">
          <strong>Reseller</strong> and <strong>affiliate</strong> partners are on the original
          agreement: they bill their restaurants directly, and CANVEXIA takes no share of it.{" "}
          <strong>Operators</strong> are CANVEXIA city partners on a revenue share — they keep their
          percentage of merchant subscriptions and CANVEXIA takes the rest. Existing partners keep
          the terms they signed; moving one to Operator is a change to those terms, not a setting.
        </p>
      </section>

    </div>
  );
}
