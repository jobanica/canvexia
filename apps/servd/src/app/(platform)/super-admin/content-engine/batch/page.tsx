import Link from "next/link";
import { getOrCreateBrand } from "@/server/content/brand";
import { contentEngineEnabled } from "@/server/content/claude";
import { BatchClient } from "@/components/super-admin/content/BatchClient";

export const metadata = { title: "Batch · Content Engine · Servd" };

export default async function BatchPage() {
  const brand = await getOrCreateBrand();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/content-engine" className="text-sm text-plum-ink/50">
          ← Content Engine
        </Link>
        <h1 className="font-heading text-2xl font-bold">Batch generate</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Generate a Jab-Jab-Jab-Right-Hook set in one go. Posts are spread across your pillars and
          scheduled onto the calendar.
        </p>
      </div>

      {!brand ? (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink">
          The Content Engine tables aren&apos;t set up yet. Run{" "}
          <code className="rounded bg-white px-1">prisma/manual/add-content-engine.sql</code> first.
        </div>
      ) : (
        <BatchClient defaultRatio={brand.jabRatio} enabled={contentEngineEnabled()} />
      )}
    </div>
  );
}
