"use client";

import { useState } from "react";
import { ImportPanel } from "./ImportPanel";
import { MergePanel } from "./MergePanel";
import { ScanPanel } from "./ScanPanel";
import { CategoryManager } from "./CategoryManager";
import type { DuplicateGroup } from "@/lib/pharmacy/duplicates";
import type { CategoryDetail } from "@/server/pharmacy/categories";

type Tool = "import" | "merge" | "scan" | "categories" | null;

/**
 * The three bulk tools, above the catalogue.
 *
 * ONE OPEN AT A TIME, IN PLACE — not a modal. A dialog over a table hides the
 * thing being changed, and the import preview is four hundred rows that want
 * the width of the page.
 *
 * `Scan receipt` is only rendered when the server says the feature is
 * configured. A button that exists and then explains it cannot work is worse
 * than no button.
 */
export function CatalogueTools({
  duplicates,
  categories,
  scanEnabled,
  canScan,
}: {
  duplicates: DuplicateGroup[];
  categories: CategoryDetail[];
  scanEnabled: boolean;
  canScan: boolean;
}) {
  const [open, setOpen] = useState<Tool>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          active={open === "categories"}
          onClick={() => setOpen(open === "categories" ? null : "categories")}
        >
          Categories
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">
            {categories.length}
          </span>
        </Button>
        <Button active={open === "import"} onClick={() => setOpen(open === "import" ? null : "import")}>
          Import CSV
        </Button>
        <Button active={open === "merge"} onClick={() => setOpen(open === "merge" ? null : "merge")}>
          Merge duplicates
          {duplicates.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
              {duplicates.length}
            </span>
          )}
        </Button>
        {scanEnabled && canScan && (
          <Button active={open === "scan"} onClick={() => setOpen(open === "scan" ? null : "scan")}>
            Scan receipt
          </Button>
        )}
      </div>

      {open === "categories" && <CategoryManager categories={categories} onClose={close} />}
      {open === "import" && <ImportPanel onClose={close} />}
      {open === "merge" && <MergePanel groups={duplicates} onClose={close} />}
      {open === "scan" && <ScanPanel onClose={close} />}
    </>
  );
}

function Button({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? "brand-gradient text-white"
          : "border border-white/15 bg-white/[0.04] text-slate-200 hover:border-white/30"
      }`}
    >
      {children}
    </button>
  );
}
