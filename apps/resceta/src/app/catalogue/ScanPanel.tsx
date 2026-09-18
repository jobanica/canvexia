"use client";

import { useActionState, useRef, useState } from "react";
import { scanDeliveryReceipt, type ScanState } from "./tools-actions";
import { Panel } from "./ImportPanel";
import { peso } from "@/lib/money";

const IDLE: ScanState = { status: "idle" };

/**
 * Reading a delivery receipt from a photo.
 *
 * THE RESULT IS A DRAFT AND THE SCREEN SAYS SO. Nothing here writes stock: the
 * extraction is shown line by line against the photo so a human can check it,
 * and receiving is still done by the receiving screen with its own validation.
 * An extraction that booked stock straight onto the shelf would be a machine
 * that can silently invent an expiry date, which is the one number this whole
 * system exists to keep right.
 *
 * `capture="environment"` opens the back camera on a phone. The person holding
 * the delivery receipt is standing at the door with the boxes.
 */
export function ScanPanel({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(scanDeliveryReceipt, IDLE);
  const [preview, setPreview] = useState<string | null>(null);
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

  if (state.status === "done") {
    const total = state.data.lines.reduce(
      (t, l) => t + l.quantity * l.unitCostCentavos,
      0,
    );
    return (
      <Panel title="What the photo says" onClose={onClose}>
        <p className="text-sm text-slate-300">
          {state.data.supplierName ? (
            <>
              From <strong className="text-white">{state.data.supplierName}</strong>.{" "}
            </>
          ) : null}
          {state.data.lines.length} lines, {peso(total)} at cost.
        </p>
        {/*
          Said plainly and above the table: this has read a photo, it has not
          counted the boxes.
        */}
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Check every line against the paper before you enter it. Nothing here has
          been saved and no stock has moved — expiry dates and costs read from a
          photo are a starting point, not a record.
        </p>

        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                <th className="px-3 py-2 font-medium">Lot</th>
                <th className="px-3 py-2 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {state.data.lines.map((l, i) => (
                <tr key={`${l.productName}-${i}`}>
                  <td className="px-3 py-2">
                    {l.productName}
                    {l.genericName && (
                      <p className="text-xs text-slate-400">{l.genericName}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.quantity || <span className="text-amber-300">?</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.unitCostCentavos ? (
                      peso(l.unitCostCentavos)
                    ) : (
                      <span className="text-amber-300">?</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {l.lotNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{l.expiryDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          A question mark is something the photo did not show clearly. Enter the
          delivery on the <strong className="text-slate-200">Receive</strong> screen, or
          against its purchase order.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Scan a delivery receipt" onClose={onClose}>
      <form action={action}>
        <input type="hidden" name="image" ref={dataRef} />
        <p className="text-sm text-slate-300">
          Photograph the supplier&rsquo;s delivery receipt or invoice. It is read into
          a list you check by eye — nothing is saved and no stock moves.
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
            alt="The receipt you are about to scan"
            className="mt-3 max-h-64 rounded-lg border border-white/10 object-contain"
          />
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={pending || !preview}
            className="brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Reading…" : "Read the receipt"}
          </button>
          {pending && <span className="text-xs text-slate-400">This takes a few seconds.</span>}
          {state.status === "error" && <span className="text-sm text-red-300">{state.message}</span>}
        </div>
      </form>
    </Panel>
  );
}
