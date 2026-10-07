import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedIn } from "@/server/auth";
import { staffDb } from "@/server/scoped-db";
import { WAITING } from "@/server/events/ingest";
import { Badge, tdClass, thClass } from "@/components/AdminShell";
import { Icon, type IconName } from "@/components/icons";
import { peso } from "@/lib/money";
import { manilaDate } from "@/lib/time";

const STATUS_TONE = { submitted: "amber", confirmed: "green", rejected: "red", reversed: "slate" } as const;

// The four headline cards: pastel card, solid circle, as in the design.
const CARD_STYLES = [
  { card: "bg-[#fdeceb]", dot: "bg-[#e53935]" },
  { card: "bg-[#fbe7fb]", dot: "bg-[#7b1fa2]" },
  { card: "bg-[#e9f9e9]", dot: "bg-[#2e7d32]" },
  { card: "bg-[#ecebfd]", dot: "bg-[#2a2ae0]" },
];

export default async function AdminOverview() {
  const who = await getSignedIn();
  if (!who || who.kind !== "staff") redirect("/login");

  if (who.role === "verifier") redirect("/admin/queue");

  const [pendingAgents, activeAgents, products, waiting, refused, queue, changes, failedCallbacks, recent] = await staffDb("admin", (tx) =>
    Promise.all([
      tx.agent.count({ where: { status: "pending" } }),
      tx.agent.count({ where: { status: "active" } }),
      tx.agentProduct.count({ where: { status: "active" } }),
      tx.agentEvent.count({ where: { processedAt: null, error: WAITING } }),
      tx.agentEvent.count({ where: { processedAt: { not: null }, error: { not: null } } }),
      tx.agentPayment.count({ where: { status: "submitted" } }),
      tx.agentPayoutDetailChange.count({ where: { status: "pending" } }),
      tx.agentCallbackOutbox.count({ where: { status: "failed" } }),
      tx.agentPayment.findMany({
        orderBy: { submittedAt: "desc" },
        take: 8,
        include: { referral: { select: { businessName: true, product: { select: { name: true } } } } },
      }),
    ]),
  );

  const headline: { label: string; value: number; href: string; icon: IconName }[] = [
    { label: "Receipts to verify", value: queue, href: "/admin/queue", icon: "peso" },
    { label: "Applications to review", value: pendingAgents, href: "/admin/agents?status=pending", icon: "list" },
    { label: "Active agents", value: activeAgents, href: "/admin/agents?status=active", icon: "users" },
    { label: "Payout detail changes", value: changes, href: "/admin/payout-changes", icon: "check" },
  ];

  const more: [string, number, string][] = [
    ["Active products", products, "/admin/products"],
    ["Callbacks that failed", failedCallbacks, "/admin/events"],
    ["Events waiting for a customer", waiting, "/admin/events?filter=waiting"],
    ["Events refused", refused, "/admin/events?filter=refused"],
  ];

  const total = recent.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-sm font-semibold">Today&apos;s data</h1>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {headline.map((t, i) => (
            <Link
              key={t.label}
              href={t.href}
              className={`flex items-start justify-between rounded-xl p-4 transition-shadow hover:shadow-md ${CARD_STYLES[i].card}`}
            >
              <div>
                <p className="text-xs text-slate-600">{t.label}</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">{t.value}</p>
              </div>
              <span className={`grid h-10 w-10 place-items-center rounded-full text-white ${CARD_STYLES[i].dot}`}>
                <Icon name={t.icon} className="h-5 w-5" />
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {more.map(([label, n, href]) => (
            <Link key={label} href={href} className="flex items-center justify-between rounded-lg bg-[#f6f5fb] px-4 py-3 text-sm hover:bg-[#ecebf7]">
              <span className="text-slate-600">{label}</span>
              <span className="font-semibold text-[#5a4bb0]">{n}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h1 className="text-sm font-semibold">Recent payments</h1>
        <div className="mt-3 overflow-x-auto rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr>{["Date", "Type", "Customer", "Amount", "Product", "Status", "Action"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id}>
                  <td className={tdClass}>{manilaDate(p.submittedAt)}</td>
                  <td className={tdClass}>{p.type === "activation" ? "Activation" : `Monthly × ${p.monthsCovered}`}</td>
                  <td className={tdClass}>{p.referral.businessName}</td>
                  <td className={tdClass}>{peso(p.amount)}</td>
                  <td className={tdClass}>{p.referral.product.name}</td>
                  <td className={tdClass}><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></td>
                  <td className={tdClass}>
                    {p.status === "submitted" ? (
                      <Link href={`/admin/queue/${p.id}`} className="font-medium text-emerald-700 hover:underline">Review</Link>
                    ) : (
                      <Link href={`/admin/queue/${p.id}`} className="text-slate-500 hover:underline">View</Link>
                    )}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td className={tdClass} colSpan={7}>No payments yet.</td></tr>}
            </tbody>
            {recent.length > 0 && (
              <tfoot>
                <tr className="bg-[#8b80cf] text-white">
                  <td className={`${tdClass} font-semibold`} colSpan={7}>Total shown: {peso(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
