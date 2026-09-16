import { PRODUCTS } from "@servd/core";
import { partnerCan, requirePartnerPageWith } from "@/server/partners/auth";
import { listPartnerMerchants, isPaying } from "@/server/partners/merchants";
import { provisionableProducts } from "@/server/products";
import { PortalShell } from "@/components/partner/PortalShell";
import { MerchantTable } from "@/components/partner/MerchantTable";
import { NewMerchant } from "@/components/partner/NewMerchant";

/**
 * Every merchant this partner owns, across every product.
 *
 * Gated on `merchants.read`, which every seat role happens to hold today — the
 * gate is here anyway, because a capability that is only checked once a role
 * exists that fails it is a capability nobody remembers to check.
 *
 * OPENING one lives here too, and nowhere else. The form used to sit on the
 * overview, which put it on a page a salesperson never sees — their overview is
 * the "My day" branch — so `merchants.create` was a capability sales held and
 * could not use. Moving it here fixes that without giving the operator's
 * dashboard a six-field form to scroll past every time they open it to read a
 * number: this is the page you are on when merchants are what you are thinking
 * about.
 */
export default async function PartnerMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; product?: string; status?: string }>;
}) {
  const partner = await requirePartnerPageWith("merchants.read");
  // Support holds merchants.read and NOT merchants.create — it answers for
  // accounts that already exist, and is shown no form.
  const canCreate = partnerCan(partner, "merchants.create");
  // From the registry, not a list written here: a vertical appears in the form
  // by registering an adapter (D36).
  const products = canCreate
    ? provisionableProducts().map((id) => ({
        id,
        name: PRODUCTS[id].name,
        description: PRODUCTS[id].description,
      }))
    : [];
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
              {canCreate
                ? "Open your first account below."
                : "Nothing has been opened yet. Your account answers for merchants rather than opening them."}
            </p>
          </div>
        ) : (
          <MerchantTable rows={rows} query={q ?? ""} product={product ?? ""} status={status ?? ""} />
        )}

        {/*
          Below the list, and OPEN on arrival only when the list is empty.

          Collapsed otherwise because this page's job is the list: an operator
          with two hundred merchants should not scroll a six-field form every
          visit, and a salesperson with none should not have to find a button
          before they can open the account they just sold.
        */}
        {canCreate && <NewMerchant products={products} defaultOpen={all.length === 0} />}
    </PortalShell>
  );
}
