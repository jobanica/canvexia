import Link from "next/link";
import { getOrCreateBrand } from "@/server/content/brand";
import { listLibraryScripts } from "@/server/content/queries";
import { LibraryTable } from "@/components/super-admin/content/LibraryTable";

export const metadata = { title: "Library · Content Engine · Servd" };

export default async function LibraryPage() {
  const [brand, scripts] = await Promise.all([getOrCreateBrand(), listLibraryScripts(200)]);
  const pillarNames = brand ? Array.from(new Set(brand.pillars.map((p) => p.name))) : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/content-engine" className="text-sm text-plum-ink/50">
          ← Content Engine
        </Link>
        <h1 className="font-heading text-2xl font-bold">Library</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Every script. Track performance, set status, expand to copy as Markdown, and remix your
          winners into fresh variations.
        </p>
      </div>

      {!brand ? (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink">
          The Content Engine tables aren&apos;t set up yet. Run{" "}
          <code className="rounded bg-white px-1">prisma/manual/add-content-engine.sql</code> first.
        </div>
      ) : scripts.length === 0 ? (
        <div className="rounded-tile border border-dashed border-plum-ink/15 bg-white p-6 text-sm text-plum-ink/50">
          No scripts yet. Head to{" "}
          <Link href="/super-admin/content-engine/generate" className="font-semibold text-brand-primary">
            Generate
          </Link>{" "}
          or{" "}
          <Link href="/super-admin/content-engine/batch" className="font-semibold text-brand-primary">
            Batch
          </Link>
          .
        </div>
      ) : (
        <LibraryTable scripts={scripts} pillarNames={pillarNames} />
      )}
    </div>
  );
}
