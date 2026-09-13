import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCustomDomainAccess, CUSTOM_DOMAIN_PRICE } from "@/server/billing/addons";
import { formatPeso } from "@/lib/money";
import { getDomainProvider } from "@/server/domains";
import { SubdomainForm, CustomDomainForm } from "@/components/admin/DomainForms";
import { DomainInstructions } from "@/components/admin/DomainInstructions";
import { UnlockCustomDomainButton } from "@/components/admin/UnlockCustomDomainButton";
import { refreshDomainStatus, removeCustomDomain } from "@/server/domains/actions";
import { WebAddressForm } from "@/components/admin/WebAddressForm";

export default async function DomainsPage() {
  const { restaurantId } = await requireAdminPage();
  const [restaurant, access] = await Promise.all([
    tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({
        select: { slug: true, subdomain: true, customDomain: true, customDomainVerifiedAt: true },
      }),
    ),
    getCustomDomainAccess(restaurantId),
  ]);
  const priceLabel = formatPeso(CUSTOM_DOMAIN_PRICE);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "servd.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.servdph.com";

  // Live DNS/verification records for a connected (unverified) domain.
  let verification: { type: string; domain: string; value: string }[] = [];
  if (restaurant.customDomain && !restaurant.customDomainVerifiedAt) {
    const status = await getDomainProvider()?.getStatus(restaurant.customDomain);
    verification = status?.verification ?? [];
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Web address &amp; domain</h1>
      </div>

      {/* Above the paywall on purpose. Correcting a typo the shop has been stuck
          with since signup is not a premium feature, and charging ₱500 to fix
          "mango-gril" would be indefensible. */}
      <WebAddressForm current={restaurant.slug} appUrl={appUrl} />

      {!access.allowed ? (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🔒</span>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-bold text-plum-ink">Custom domain is locked</h2>
              <p className="mt-1 text-sm text-plum-ink/70">
                Run your ordering site on your own web address (e.g.{" "}
                <span className="font-semibold text-plum-ink">order.yourrestaurant.com</span>) instead of a
                Servd link.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {/* Option 1 — one-time unlock */}
                <div className="rounded-lg border border-brand-primary/40 bg-cream/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/45">One-time</p>
                  <p className="font-heading text-2xl font-extrabold text-plum-ink">{priceLabel}</p>
                  <p className="mt-1 text-xs text-plum-ink/60">
                    Pay once and keep custom domains on this account — no monthly upgrade needed.
                  </p>
                  <div className="mt-3">
                    <UnlockCustomDomainButton price={priceLabel} pending={access.pending} />
                  </div>
                  {access.pending && (
                    <p className="mt-2 text-xs text-plum-ink/50">
                      A checkout was already started. If you&apos;ve paid, it unlocks here within a minute.
                    </p>
                  )}
                </div>

                {/* Option 2 — included in Growth */}
                <div className="rounded-lg border border-plum-ink/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/45">Or included in</p>
                  <p className="font-heading text-2xl font-extrabold text-plum-ink">Growth</p>
                  <p className="mt-1 text-xs text-plum-ink/60">
                    Custom domains are part of the Growth plan (and above) — plus everything else on that tier.
                  </p>
                  <Link
                    href="/admin/billing"
                    className="mt-3 inline-block rounded-full border border-plum-ink/20 px-5 py-2.5 text-sm font-semibold text-plum-ink"
                  >
                    See plans →
                  </Link>
                </div>
              </div>

              <p className="mt-3 text-xs text-plum-ink/45">
                Free plan and trial accounts need the one-time unlock. Paid Growth/Business plans include it.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <SubdomainForm current={restaurant.subdomain ?? ""} rootDomain={rootDomain} />
          <CustomDomainForm current={restaurant.customDomain ?? ""} />

          <DomainInstructions
            domain={restaurant.customDomain ?? null}
            verified={!!restaurant.customDomainVerifiedAt}
            records={verification}
          />

          {restaurant.customDomain && (
            <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold">{restaurant.customDomain}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    restaurant.customDomainVerifiedAt
                      ? "bg-mango/15 text-mango"
                      : "bg-muted/20 text-muted"
                  }`}
                >
                  {restaurant.customDomainVerifiedAt ? "Verified · SSL active" : "Pending DNS"}
                </span>
              </div>

              <div className="mt-4 flex gap-2">
                <form action={refreshDomainStatus}>
                  <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                    Refresh status
                  </button>
                </form>
                <form action={removeCustomDomain}>
                  <button className="text-xs text-muted hover:text-guava">Disconnect</button>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
