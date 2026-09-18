"use client";

import { useActionState, useRef, useState } from "react";
import { scanIntoDelivery, type ScanIntoState } from "./scan-actions";
import type { MatchedLine } from "@/lib/pharmacy/receipt-match";
import { peso } from "@/lib/money";

const IDLE: ScanIntoState = { status: "idle" };

export interface ScannedDraft {
  productId: string;
  newProductName: string;
  lotNumber: string;
  expiryDate: string;
  quantity: string;
  unitCost: string;
}

/**
 * Photograph the delivery receipt, check it, put it in the form.
 *
 * THE VERIFY STEP IS THE POINT. Every line is shown with what the photo read
 * and what it was matched to, and only the ones ticked go into the form. A line
 * matched EXACTLY with a readable quantity and cost is ticked to begin with —
 * that is the "auto" part. Anything guessed, ambiguous or unreadable starts
 * unticked with the reason written next to it.
 *
 * Nothing here books stock. The lines land in the receiving form below, where
 * the same Receive button as a hand-typed delivery runs the same code — one
 * stock path, one set of rules.
 */
export function ScanIntoDelivery({
  onAccept,
  onSupplier,
}: {
  onAccept: (lines: ScannedDraft[]) => void;
  onSupplier: (name: string) => void;
}) {
  const [state, action, pending] = useActionState(scanIntoDelivery, IDLE);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<number> | null>(null);
  const dataRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      setPreview(url);
      if (dataRef.current) dataRef.current.value = url;
    };
    reader.readAsDataURL(file);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 hover:border-white/30"
      >
        Scan the delivery receipt
      </button>
    );
  }

  // The tick state starts from the scan and is then the person's to change.
  const lines = state.status === "done" ? state.lines : [];
  const picked =
    chosen ??
    new Set(
      lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.blockers.length === 0 && l.match.confidence === "exact")
        .map(({ i }) => i),
    );

  function toggle(i: number) {
    const next = new Set(picked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setChosen(next);
  }

  function accept() {
    const drafts: ScannedDraft[] = lines
      .filter((_, i) => picked.has(i))
      .map((l) => ({
        productId: l.match.productId ?? "",
        // With no match the name is carried over so it can be created, or
        // typed over — never silently dropped.
        newProductName: l.match.productId ? "" : l.productName,
        lotNumber: l.lotNumber ?? "",
        expiryDate: l.expiryDate ?? "",
        quantity: l.quantity > 0 ? String(l.quantity) : "",
        unitCost: l.unitCostCentavos > 0 ? (l.unitCostCentavos / 100).toFixed(2) : "",
      }));
    if (state.status === "done" && state.supplierName) onSupplier(state.supplierName);
    onAccept(drafts);
    setOpen(false);
    setChosen(null);
    setPreview(null);
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Scan the delivery receipt</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setChosen(null);
          }}
          className="text-sm text-slate-400 hover:text-white"
        >
          Close
        </button>
      </div>

      {state.status !== "done" && (
        <form action={action}>
          <input type="hidden" name="image" ref={dataRef} />
          <p className="text-sm text-slate-300">
            Photograph the supplier&rsquo;s receipt. Each line is matched against your
            catalogue and shown for checking — nothing is received until you press
            the Receive button below.
          </p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            className="mt-3 block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white"
          />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="The receipt about to be scanned"
              className="mt-3 max-h-56 rounded-lg border border-white/10 object-contain"
            />
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || !preview}
              className="brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? "Reading…" : "Read the receipt"}
            </button>
            {pending && <span className="text-xs text-slate-400">A few seconds.</span>}
            {state.status === "error" && (
              <span className="text-sm text-red-300">{state.message}</span>
            )}
          </div>
        </form>
      )}

      {state.status === "done" && (
        <>
          <p className="text-sm text-slate-300">
            {state.supplierName ? (
              <>
                From <strong className="text-white">{state.supplierName}</strong>.{" "}
              </>
            ) : null}
            {state.lines.length} lines read, {state.ready} matched exactly and ready.
          </p>
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Check each line against the paper and against the boxes in front of you.
            Only ticked lines go into the delivery, and nothing is received until you
            press Receive.
          </p>

          <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Use</th>
                  <th className="px-3 py-2 font-medium">Read from the photo</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {state.lines.map((l, i) => (
                  <Row key={`${l.productName}-${i}`} line={l} on={picked.has(i)} toggle={() => toggle(i)} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={accept}
              disabled={picked.size === 0}
              className="brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Put {picked.size} line{picked.size === 1 ? "" : "s"} in the delivery
            </button>
            <span className="text-xs text-slate-400">
              You can still edit every line before receiving.
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ line, on, toggle }: { line: MatchedLine; on: boolean; toggle: () => void }) {
  const badge =
    line.match.confidence === "exact"
      ? { text: "matched", cls: "bg-emerald-500/15 text-emerald-300" }
      : line.match.confidence === "likely"
        ? { text: "check this match", cls: "bg-amber-500/15 text-amber-200" }
        : { text: "no product", cls: "bg-white/10 text-slate-300" };

  return (
    <tr className={on ? undefined : "opacity-60"}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={on} onChange={toggle} aria-label={`Use ${line.productName}`} />
      </td>
      <td className="px-3 py-2">
        {line.productName}
        {line.genericName && <p className="text-xs text-slate-400">{line.genericName}</p>}
        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[0.65rem] ${badge.cls}`}>
          {badge.text}
        </span>
        {line.blockers.length > 0 && (
          <p className="mt-1 text-xs text-amber-300">{line.blockers.join(", ")}</p>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {line.quantity > 0 ? line.quantity : <span className="text-amber-300">?</span>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {line.unitCostCentavos > 0 ? (
          peso(line.unitCostCentavos)
        ) : (
          <span className="text-amber-300">?</span>
        )}
      </td>
      <td className="px-3 py-2 text-slate-400">{line.expiryDate ?? "—"}</td>
    </tr>
  );
}
