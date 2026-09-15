import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { listPartnerMerchants, isPaying } from "@/server/partners/merchants";
import { PortalShell } from "@/components/partner/PortalShell";
import { MerchantTable } from "@/components/partner/MerchantTable";

/**
 * Every merchant this partner owns, across every product.
 *
 * Gated on `merchants.read`, which every seat role happens to hold today — the
 * gate is here anyway, because a capability that is only checked once a role
 * exists that fails it is a capability nobody remembers to check.
 */
export default async function PartnerMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; product?: string; status?: string }>;
}) {
  const partner = await requirePartnerPageWith("merchants.read");
  const { q, product, status } = await searchParams;

  const all = await listPartnerMerchants(partner.id);
  const needle = (q ?? "").trim().toLowerCase();

  const rows = all.filter((m) => {
    if (product && m.productId !== product) return false;
    if (status === "paying" && !isPaying(m)) return false;
    if (status === "trialing" && m.subscriptionStatus !== "trialing") return false;
    if (status === "past_due" && m.subscriptionStatus !== "past_due") return false;
    if (!needle) return true;
    return (
      m.name.toLowerCase().includes(needle) ||
      m.slug.toLowerCase().includes(needle) ||
      (m.city ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <PortalShell
      partner={partner}
      title="Merchants"
      subtitle="Every account you have opened, across every product."
      counts={{ merchants: all.length }}
    >
        {all.length === 0 ? (
          <div className="mt-6 rounded-tile border border-dashed border-brand-ink/15 bg-white p-10 text-center">
            <p className="font-heading text-lg font-bold">No merchants yet</p>
            <p className="mt-1 text-sm text-brand-ink/55">
              Open your first account from the dashboard.
            </p>
            <Link
              href="/partner"
              className="mt-5 inline-flex rounded-full bg-brand-ink px-5 py-2.5 text-sm font-semibold text-white"
            >
              Create your first
            </Link>
          </div>
        ) : (
          <MerchantTable rows={rows} query={q ?? ""} product={product ?? ""} status={status ?? ""} />
        )}
    </PortalShell>
  );
}
