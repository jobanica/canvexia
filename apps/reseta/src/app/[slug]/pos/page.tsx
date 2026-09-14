import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveSlug, catalogue } from "@/server/pharmacy/queries";
import { Counter } from "./Counter";

export const dynamic = "force-dynamic";

export default async function PosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pharmacy = await resolveSlug(slug);
  if (!pharmacy) notFound();

  const products = await catalogue(pharmacy.id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <Link href={`/${slug}`} className="text-sm text-slate-500 hover:underline">
          ← {pharmacy.displayName ?? pharmacy.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Counter</h1>
      </header>

      {pharmacy.status !== "active" ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This pharmacy is <strong>{pharmacy.status}</strong> and cannot dispense
          yet.
        </p>
      ) : (
        <Counter slug={slug} vatRatePct={pharmacy.vatRatePct} products={products} />
      )}
    </main>
  );
}
