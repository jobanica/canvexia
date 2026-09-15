import Link from "next/link";
import { notFound } from "next/navigation";
import { partnerCan, requirePartnerPageWith } from "@/server/partners/auth";
import { getPartnerMerchant, merchantAssignees, isPaying } from "@/server/partners/merchants";
import { PortalShell } from "@/components/partner/PortalShell";
import { peso } from "@/components/partner/Overview";

/**
 * One merchant.
 *
 * The key is `productId:id` because a merchant id is unique only WITHIN a
 * product (D29) — `/merchants/abc123` would be ambiguous the moment two
 * products both have an abc123, and ambiguous in a way that returns the wrong
 * shop rather than nothing.
 *
 * `getPartnerMerchant` reads through partnerDb, so a key belonging to another
 * partner resolves to null and this page 404s. It answers "not found" rather
 * than "not yours" on purpose: probing ids should not be a directory.
 */
export default async function PartnerMerchantPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const partner = await requirePartnerPageWith("merchants.read");
  const { key } = await params;
  const merchant = await getPartnerMerchant(partner.id, decodeURIComponent(key));
  if (!merchant) notFound();

  const assignees = await merchantAssignees(partner.id, merchant.productId, merchant.id);

  const facts = [
    { label: "Product", value: merchant.productName },
    { label: "Plan", value: merchant.planName ?? "Not billed yet" },
    {
      label: "Monthly price",
      value: merchant.priceMonthly === null ? "—" : peso(merchant.priceMonthly),
    },
    { label: "Status", value: merchant.status },
    { label: "Orders, last 30 days", value: String(merchant.ordersLast30d) },
    {
      label: "Last order",
      value: merchant.lastOrderAt ? merchant.lastOrderAt.toLocaleDateString() : "Never",
    },
    { label: "Opened", value: merchant.createdAt.toLocaleDateString() },
    { label: "Address", value: merchant.city ?? "—" },
    // A7. "Nobody yet" rather than an em dash: an unassigned merchant is a
    // thing to fix, and a dash reads as "not applicable".
    { label: "Signed by", value: assignees.signedBy ?? "Nobody yet" },
    { label: "Supported by", value: assignees.supportedBy ?? "Nobody yet" },
  ];

  return (
    <PortalShell
      partner={partner}
      title={merchant.name}
      subtitle={`${merchant.productName} · /${merchant.slug}`}
    >
        <Link href="/partner/merchants" className="text-sm text-brand-ink/50 hover:text-brand-ink">
          ← All merchants
        </Link>

        {merchant.subscriptionStatus === "past_due" && (
          <p className="mt-4 rounded-lg bg-guava/10 px-4 py-3 text-sm text-guava">
            This account is past due. A failed payment stops nothing on its own — the account
            keeps working until HQ suspends it — but it is not earning either of you anything.
          </p>
        )}

        <dl className="mt-6 grid gap-px overflow-hidden rounded-tile bg-brand-ink/10 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="bg-white p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
                {f.label}
              </dt>
              <dd className="mt-1 text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-sm text-brand-ink/55">
          {isPaying(merchant)
            ? `Earning you ${peso(Math.floor(((merchant.priceMonthly ?? 0) * partner.revenueSharePct) / 100))} a month at your ${partner.revenueSharePct}% share.`
            : "Not paying yet, so it is not earning either of you anything."}
        </p>

        {/*
          A2 ships the READ side. The actions in the brief — change plan, extend
          trial, suspend, resend invite, mark invoice paid, and above all "log in
          as merchant" — each write to another tenant's data and each needs its
          own audit row and confirmation. They are deliberately not stubbed here:
          a disabled button that looks like a feature is worse than an honest
          gap, and half an impersonation flow is a security hole with a spinner.
        */}
        <div className="mt-8 rounded-tile border border-dashed border-brand-ink/15 bg-white p-5">
          <p className="text-sm font-semibold">Actions are not built yet</p>
          <p className="mt-1 text-sm text-brand-ink/55">
            Changing a plan, extending a trial, suspending an account and signing in as a
            merchant all write to this merchant&rsquo;s own data. They land with their audit
            trail rather than ahead of it.
          </p>
          {partnerCan(partner, "merchants.impersonate") && (
            <p className="mt-2 text-xs text-brand-ink/40">
              Your seat will be able to sign in as a merchant once that flow exists.
            </p>
          )}
        </div>
    </PortalShell>
  );
}
