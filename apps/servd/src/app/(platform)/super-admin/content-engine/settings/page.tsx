import Link from "next/link";
import { getOrCreateBrand } from "@/server/content/brand";
import { SettingsClient } from "@/components/super-admin/content/SettingsClient";

export const metadata = { title: "Settings · Content Engine · Servd" };

export default async function ContentSettingsPage() {
  const brand = await getOrCreateBrand();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/content-engine" className="text-sm text-plum-ink/50">
          ← Content Engine
        </Link>
        <h1 className="font-heading text-2xl font-bold">Settings</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          The brand voice and pillars that drive every script. Changes here apply immediately — no
          code edit needed.
        </p>
      </div>

      {!brand ? (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink">
          The Content Engine tables aren&apos;t set up yet. Run{" "}
          <code className="rounded bg-white px-1">prisma/manual/add-content-engine.sql</code> first.
        </div>
      ) : (
        <SettingsClient
          systemPrompt={brand.systemPrompt}
          jabRatio={brand.jabRatio}
          pillars={brand.pillars}
        />
      )}
    </div>
  );
}
