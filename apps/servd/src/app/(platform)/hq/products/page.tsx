import { hqCan } from "@servd/core";
import { requireHqPage } from "@/server/hq/auth";
import { listPlans, listProducts } from "@/server/hq/products";
import { HqShell } from "@/components/hq/HqShell";
import { peso } from "@/components/canvexia/Cards";
import { FlagForm, PlanFloorForm, ProductForm } from "@/components/hq/ProductForms";

const STATUS_TONE: Record<string, string> = {
  live: "bg-brand-primary/10 text-brand-primary",
  beta: "bg-brand-accent/15 text-brand-accent",
  coming: "bg-brand-ink/5 text-brand-ink/50",
};

export default async function HqProductsPage() {
  const user = await requireHqPage("products.write");
  const [products, plans] = await Promise.all([listProducts(), listPlans()]);
  const canFloor = hqCan(user.role, "plans.floor");

  return (
    <HqShell
      user={user}
      title="Products & plans"
      subtitle="What CANVEXIA sells, what it costs, and what is switched on."
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {products.map((p) => (
          <div key={p.id}>
            <ProductForm
              id={p.id}
              name={p.name}
              provisionable={p.provisionable}
              status={p.status}
              trainingUrl={p.trainingUrl}
              demoAccountRef={p.demoAccountRef}
              defaultEnabled={p.defaultEnabled}
              merchants={p.merchants}
            />
            <div className="mt-2 rounded-tile border border-brand-ink/10 bg-white px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Feature flags</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_TONE[p.status]}`}
                >
                  {p.status}
                </span>
              </div>
              {p.flags.length === 0 ? (
                <p className="mt-1 text-xs text-brand-ink/45">None set.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {p.flags.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">
                        {f.key}
                        {f.partnerId && (
                          <span className="ml-1.5 text-[0.65rem] text-brand-accent">
                            partner override
                          </span>
                        )}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase ${
                          f.enabled ? "bg-brand-primary/10 text-brand-primary" : "bg-brand-ink/5 text-brand-ink/45"
                        }`}
                      >
                        {f.enabled ? "on" : "off"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <FlagForm productId={p.id} />
              {/* The column exists so per-partner flags are a row later rather
                  than a migration during a launch — but nothing writes one yet,
                  and a UI that half-supported it would produce rows nothing
                  reads. */}
              <p className="mt-2 text-xs text-brand-ink/40">
                Global on/off in this phase. The per-partner column exists so adding that later is
                a row, not a migration.
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <h2 className="border-b border-brand-ink/10 px-5 py-4 font-heading text-lg font-bold">
          Plans
        </h2>
        {plans.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-brand-ink/50">No plans.</p>
        ) : (
          <ul className="divide-y divide-brand-ink/[0.06]">
            {plans.map((p) => (
              <li key={p.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-heading text-lg font-bold">{p.name}</span>
                    {!p.isActive && (
                      <span className="ml-2 rounded-full bg-brand-ink/5 px-2 py-0.5 text-[0.6rem] font-semibold uppercase text-brand-ink/45">
                        inactive
                      </span>
                    )}
                  </span>
                  <span className="text-sm tabular-nums text-brand-ink/60">
                    {peso(p.priceMonthly)}/mo · floor{" "}
                    {p.priceFloor > 0 ? peso(p.priceFloor) : "none"} · {p.trialDays}-day trial ·{" "}
                    {p.merchants} merchant{p.merchants === 1 ? "" : "s"}
                  </span>
                </div>

                {p.below.length > 0 && (
                  <p className="mt-1 text-xs text-guava">
                    {p.below.length} partner{p.below.length === 1 ? "" : "s"} currently priced below
                    this floor: {p.below.map((b) => b.partnerName).join(", ")}.
                  </p>
                )}

                {canFloor ? (
                  <PlanFloorForm
                    planId={p.id}
                    planName={p.name}
                    priceFloor={p.priceFloor}
                    priceMonthly={p.priceMonthly}
                  />
                ) : (
                  <p className="mt-2 text-xs text-brand-ink/40">
                    Changing a floor is a super-admin action.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
          A floor exists because partners set their own prices and merchants talk to each other.
          One operator undercutting another does not just start a price war between them —
          CANVEXIA&rsquo;s share is a percentage of whatever was actually charged.
        </p>
      </div>
    </HqShell>
  );
}
