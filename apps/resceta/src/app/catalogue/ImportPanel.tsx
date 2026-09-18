"use client";

import { useActionState, useRef, useState } from "react";
import { importProducts, type ToolState } from "./tools-actions";
import { parseCsv, readImport, TEMPLATE_HEADER, type ImportRow } from "@/lib/pharmacy/csv";
import { peso } from "@/lib/money";

const IDLE: ToolState = { status: "idle" };

/**
 * Importing a price list.
 *
 * READ AND SHOWN BEFORE ANYTHING IS SENT. The file is parsed in the browser and
 * every row is displayed with its problems, so the person importing four
 * hundred products sees what will happen before it happens. The server re-parses
 * the same text rather than trusting this preview — this is a review step, not
 * the validation.
 *
 * BROKEN ROWS ARE SHOWN, NOT HIDDEN. An importer that silently drops the twelve
 * rows it could not read leaves somebody comparing counts and guessing.
 */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(importProducts, IDLE);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const textRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = readImport(parseCsv(text));
      if (parsed.error) {
        setFileError(parsed.error);
        setRows(null);
        return;
      }
      setFileError(null);
      setRows(parsed.rows);
      setFileName(file.name);
      // The raw text travels with the form, so the server parses the file
      // rather than this component's opinion of it.
      if (textRef.current) textRef.current.value = text;
    };
    reader.onerror = () => setFileError("That file could not be read.");
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const sample = [
      TEMPLATE_HEADER.join(","),
      "Biogesic 500mg,Paracetamol,Tablet,500mg,BIO500,4800000000001,piece,Analgesic,8.00,5.00,100,2028-01-31,LOT-A,24,no",
      '"Amoxicillin 500mg, 100s",Amoxicillin,Capsule,500mg,AMX500,,box,Antibiotic,850.00,600.00,10,06/2027,LOT-B,5,yes',
    ].join("\n");
    const url = URL.createObjectURL(new Blob([sample], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "resceta-catalogue-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const usable = rows?.filter((r) => r.problems.length === 0) ?? [];
  const broken = rows?.filter((r) => r.problems.length > 0) ?? [];
  const withStock = usable.filter((r) => r.quantity > 0);

  if (state.status === "done") {
    return (
      <Panel title="Import finished" onClose={onClose}>
        <p className="text-sm text-emerald-300">{state.message}</p>
      </Panel>
    );
  }

  return (
    <Panel title="Import products from a CSV" onClose={onClose}>
      <form action={action}>
        <input type="hidden" name="csv" ref={textRef} />

        <p className="text-sm text-slate-300">
          The first row must be a header. Column names are matched loosely —
          <span className="text-slate-400"> name, generic, sku, barcode, price, cost, quantity, expiry, lot, reorder, rx</span>.
          A quantity with a cost creates opening stock as a real batch.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white"
          />
          <button type="button" onClick={downloadTemplate} className="text-xs text-slate-400 underline">
            Download a template
          </button>
        </div>

        {fileError && <p className="mt-3 text-sm text-red-300">{fileError}</p>}

        {rows && (
          <>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <span className="text-white">
                <strong>{usable.length}</strong> ready
              </span>
              {withStock.length > 0 && (
                <span className="text-slate-300">
                  {withStock.length} with opening stock
                </span>
              )}
              {broken.length > 0 && (
                <span className="text-amber-300">{broken.length} will be skipped</span>
              )}
              <span className="text-slate-500">{fileName}</span>
            </div>

            {broken.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                {broken.slice(0, 20).map((r) => (
                  <p key={r.line}>
                    Line {r.line} {r.name ? `(${r.name})` : ""}: {r.problems.join("; ")}
                  </p>
                ))}
                {broken.length > 20 && <p className="mt-1">…and {broken.length - 20} more.</p>}
              </div>
            )}

            <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#241d3a] text-left uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Product</th>
                    <th className="px-3 py-1.5 font-medium">Generic</th>
                    <th className="px-3 py-1.5 text-right font-medium">Price</th>
                    <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-1.5 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {usable.slice(0, 200).map((r) => (
                    <tr key={r.line}>
                      <td className="px-3 py-1.5">
                        {r.name}
                        {r.requiresPrescription && (
                          <span className="ml-2 rounded bg-violet-500/15 px-1 text-[0.65rem] text-violet-300">
                            Rx
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-400">{r.genericName ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {peso(r.priceCentavos)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.quantity || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-400">{r.expiry ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" name="updateExisting" defaultChecked />
              Update products that already exist (matched on barcode, then SKU, then name)
            </label>

            <div className="mt-4 flex items-center gap-3">
              <button
                disabled={pending || usable.length === 0}
                className="brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Importing…" : `Import ${usable.length} products`}
              </button>
              {state.status === "error" && (
                <span className="text-sm text-red-300">{state.message}</span>
              )}
            </div>
          </>
        )}
      </form>
    </Panel>
  );
}

export function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-white">
          Close
        </button>
      </div>
      {children}
    </section>
  );
}
