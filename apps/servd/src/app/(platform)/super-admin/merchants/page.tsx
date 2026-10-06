import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getMerchantDirectory } from "@/server/partners/directory";

/**
 * Every merchant on the platform. Read-only since the partner portal was
 * retired (D38): there are no partners to move merchants between any more.
 */
export default async function SuperAdminMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; q?: string }>;
}) {
  await requireSuperAdminPage();
  const sp = await searchParams;
  const { merchants, partners, total } = await getMerchantDirectory({
    partnerId: sp.partner ?? null,
    query: sp.q ?? null,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Merchants</h1>
        <p className="text-sm text-plum-ink/50">
          {total} merchant{total === 1 ? "" : "s"} across {partners.length} approved partner
          {partners.length === 1 ? "" : "s"}.
        </p>
      </div>

      <form className="flex flex-wrap gap-2" action="/super-admin/merchants">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search name or slug"
          className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <select
          name="partner"
          defaultValue={sp.partner ?? ""}
          className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        >
          <option value="">All partners</option>
          <option value="__unassigned__">Unassigned</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
          Filter
        </button>
      </form>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        {merchants.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No merchants match.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {merchants.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {m.name}
                    {!m.live && (
                      <span className="ml-2 rounded-full bg-plum-ink/5 px-2 py-0.5 text-xs text-plum-ink/50">
                        demo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-plum-ink/45">
                    /{m.slug} · {m.planName ?? "no plan"} ·{" "}
                    {m.partnerName ? (
                      m.partnerName
                    ) : (
                      <span className="font-semibold text-guava">unassigned</span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
