import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { shopBySlug, shopItems } from "@/server/pharmacy/storefront";
import { ShopForm } from "./ShopForm";

export const dynamic = "force-dynamic";

/**
 * The public shop page.
 *
 * NO SESSION, NO APP SHELL, NO NAV. A customer arriving from a Facebook post
 * should see a shop, not the chrome of a system they have no account for.
 *
 * PRESCRIPTION-ONLY ITEMS ARE NOT LISTED, and the filter is in the query rather
 * than here — dispensing one without a prescription is an offence, and a
 * template filter is one refactor away from being dropped.
 *
 * NOTHING ON THIS PAGE MOVES STOCK OR TAKES MONEY. The order is a request; the
 * pharmacy confirms it and rings it up at the counter, which is the one path
 * that allocates FEFO, snapshots cost and writes the ledger.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await shopBySlug(slug);
  if (!shop) return { title: "Not found" };
  const name = shop.displayName ?? shop.name;
  return {
    title: name,
    description: shop.blurb ?? `Order from ${name}.`,
  };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await shopBySlug(slug);
  // Off, suspended or non-existent are one answer to the public: a suspended
  // pharmacy must not take orders it cannot fill.
  if (!shop) notFound();

  const items = await shopItems(shop.id);
  const name = shop.displayName ?? shop.name;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      {shop.blurb && <p className="mt-2 text-slate-600">{shop.blurb}</p>}
      <p className="mt-2 text-sm text-slate-500">
        {shop.address}
        {shop.address && shop.phone && " · "}
        {shop.phone && (
          <a href={`tel:${shop.phone}`} className="underline">
            {shop.phone}
          </a>
        )}
      </p>

      <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Send what you need and the pharmacy will ring you back to confirm. You
        pay when you collect — nothing is charged here.{" "}
        <strong>Prescription medicines are not listed:</strong> bring the
        prescription to the counter.
      </p>

      <div className="mt-8">
        <ShopForm slug={shop.slug} items={items} acceptsDelivery={shop.acceptsDelivery} />
      </div>
    </main>
  );
}
