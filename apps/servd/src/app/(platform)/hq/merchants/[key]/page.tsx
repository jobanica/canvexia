import Link from "next/link";
import { notFound } from "next/navigation";
import { hqCan } from "@servd/core";
import { requireHqPage } from "@/server/hq/auth";
import { listAllMerchants } from "@/server/hq/merchants";
import { searchLedger } from "@/server/hq/billing";
import { systemDb } from "@/server/tenancy/scoped-db";
import { HqShell } from "@/components/hq/HqShell";
import { peso } from "@/components/canvexia/Cards";
import { FlagNational, ForcePlan, ReassignMerchant } from "@/components/hq/MerchantActions";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-brand-ink/[0.06] py-2.5 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-brand-ink/45">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || <span className="text-brand-ink/30">—</span>}</dd>
    </div>
  );
}

export default async function HqMerchantDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const user = await requireHqPage("partners.read");
  const { key } = await params;
  const decoded = decodeURIComponent(key);

  const [{ rows, partners, house }, plans] = await Promise.all([
    listAllMerchants(),
    systemDb((tx) =>
      tx.plan.findMany({
        where: { isActive: true },
        orderBy: { priceMonthly: "asc" },
        select: { id: true, name: true, priceMonthly: true },
      }),
    ),
  ]);

  const m = rows.find((r) => r.key === decoded);
  if (!m) notFound();

  // Ledger events for this merchant, across every partner that has ever owned
  // it — which is the point of looking here rather than on the partner.
  const ledger = await searchLedger({ merchantId: m.id, limit: 50 });

  const canMove = hqCan(user.role, "merchants.reassign");
  const canForcePlan = hqCan(user.role, "plans.floor");

  return (
    <HqShell
      user={user}
      title={m.name}
      subtitle={`${m.productName} · ${m.partnerName ?? "unassigned"} · ${m.status}`}
      actions={
        <Link href="/hq/merchants" className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface">
          All merchants
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
          <h2 className="font-heading text-lg font-bold">Account</h2>
          <dl className="mt-3">
            <Field label="Product" value={m.productName} />
            <Field label="Slug" value={m.slug} />
            <Field
              label="Owner"
              value={
                m.partnerId ? (
                  <Link href={`/hq/partners/${m.partnerId}`} className="text-brand-primary">
                    {m.partnerName}
                    {m.isHouse && " (house account)"}
                  </Link>
                ) : (
                  <span className="text-guava">Nobody. Invisible to every portal.</span>
                )
              }
            />
            {m.referralPartnerName && <Field label="Referred by" value={m.referralPartnerName} />}
            <Field
              label="Plan"
              value={
                m.planName
                  ? `${m.planName}${m.priceMonthly !== null ? ` · ${peso(m.priceMonthly)}` : ""}`
                  : "Not billed yet"
              }
            />
            <Field label="Subscription" value={m.subscriptionStatus ?? "none"} />
            <Field label="City" value={m.city} />
            <Field label="Orders, last 30 days" value={String(m.ordersLast30d)} />
            <Field
              label="Last activity"
              value={m.lastActivityAt?.toLocaleDateString("en-PH", { dateStyle: "medium" }) ?? "never"}
            />
            <Field label="Signed in yet" value={m.live ? "Yes" : "No login has been created"} />
          </dl>
        </div>

        <div className="space-y-4">
          {!m.reassignable && (
            <p className="rounded-tile border border-dashed border-brand-ink/15 p-4 text-xs text-brand-ink/55">
              {m.productName} merchants cannot be reassigned yet. Ownership transfer writes
              <code className="mx-1 text-[0.7rem]">restaurants.partnerId</code>, and this axis has
              no equivalent path — a button here would look like it worked.
            </p>
          )}
          {canMove && m.reassignable && (
            <>
              <ReassignMerchant
                merchantKey={m.key}
                merchantName={m.name}
                partners={partners.filter((p) => p.status === "approved")}
              />
              {!m.isHouse && (
                <FlagNational
                  merchantKey={m.key}
                  merchantName={m.name}
                  houseName={house?.name ?? null}
                />
              )}
            </>
          )}
          {canForcePlan && m.reassignable && (
            <ForcePlan
              merchantKey={m.key}
              merchantName={m.name}
              currentPlan={m.planName}
              plans={plans}
            />
          )}
          {!canMove && !canForcePlan && (
            <p className="rounded-tile border border-dashed border-brand-ink/15 p-4 text-xs text-brand-ink/50">
              Moving a merchant and forcing a plan are super-admin actions.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <h2 className="border-b border-brand-ink/10 px-5 py-4 font-heading text-lg font-bold">
          Ledger events
        </h2>
        {ledger.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
            Nothing has settled for this merchant.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
              <tr>
                <th className="px-5 py-3 font-semibold">When</th>
                <th className="px-3 py-3 font-semibold">Paid to</th>
                <th className="px-3 py-3 font-semibold">Kind</th>
                <th className="px-3 py-3 text-right font-semibold">Gross</th>
                <th className="px-5 py-3 text-right font-semibold">Partner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-ink/[0.06]">
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-3 text-xs tabular-nums">
                    {l.occurredAt.toLocaleDateString("en-PH", { dateStyle: "medium" })}
                  </td>
                  <td className="px-3 py-3">{l.partnerName}</td>
                  <td className="px-3 py-3">
                    {l.kind}
                    {l.adjustmentReason && (
                      <span className="block text-xs text-brand-ink/45">{l.adjustmentReason}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{peso(l.grossAmount)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{peso(l.partnerAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
          Every partner that has ever been paid for this merchant — which is why this list lives
          here rather than on one partner&rsquo;s page.
        </p>
      </div>
    </HqShell>
  );
}
