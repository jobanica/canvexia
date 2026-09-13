import Link from "next/link";
import { getOrCreateBrand } from "@/server/content/brand";
import { contentEngineEnabled } from "@/server/content/claude";
import { GenerateClient } from "@/components/super-admin/content/GenerateClient";

export const metadata = { title: "Generate · Content Engine · Servd" };

export default async function GeneratePage() {
  const brand = await getOrCreateBrand();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/content-engine" className="text-sm text-plum-ink/50">
          ← Content Engine
        </Link>
        <h1 className="font-heading text-2xl font-bold">Generate a script</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Taglish short-form scripts on the Jab-Jab-Jab-Right-Hook framework. Jabs give value;
          right hooks make the ask. Each generation is saved to your library.
        </p>
      </div>

      {!brand ? (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink">
          The Content Engine tables aren&apos;t set up yet. Run{" "}
          <code className="rounded bg-white px-1">prisma/manual/add-content-engine.sql</code> in the
          Supabase SQL editor, then refresh.
        </div>
      ) : (
        <GenerateClient pillars={brand.pillars} enabled={contentEngineEnabled()} />
      )}
    </div>
  );
}
