import { listAllPlans } from "@/server/billing/super-admin";
import { togglePlanActive } from "@/server/billing/super-admin-actions";
import { PlanForm } from "@/components/super-admin/PlanForm";
import { formatPeso } from "@/lib/money";

export default async function PlansPage() {
  const plans = await listAllPlans();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Plans</h1>
        <p className="text-sm text-plum-ink/50">
          The subscription tiers restaurants can be on. Price, limits, and the features you tick
          for each plan drive exactly what every tenant is entitled to — toggle a feature and it
          applies live to every restaurant on that plan.
        </p>
      </div>

      {/* Existing plans */}
      <div className="space-y-5">
        {plans.map((p) => (
          <div key={p.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">
                {p.name}{" "}
                <span className="text-sm font-normal text-plum-ink/50">
                  {formatPeso(p.priceMonthly)}/mo · {p.subscriberCount} subscriber
                  {p.subscriberCount === 1 ? "" : "s"}
                </span>
                {!p.isActive && (
                  <span className="ml-2 rounded-full bg-plum-ink/10 px-2 py-0.5 text-xs font-semibold text-plum-ink/50">
                    archived
                  </span>
                )}
              </h2>
              <form action={togglePlanActive}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={(!p.isActive).toString()} />
                <button className="rounded border border-plum-ink/15 px-3 py-1 text-xs font-semibold hover:bg-cream">
                  {p.isActive ? "Archive" : "Activate"}
                </button>
              </form>
            </div>
            <PlanForm plan={p} />
          </div>
        ))}
      </div>

      {/* New plan */}
      <div className="space-y-2 border-t border-plum-ink/10 pt-6">
        <h2 className="font-heading text-lg font-bold">New plan</h2>
        <PlanForm />
      </div>
    </div>
  );
}
