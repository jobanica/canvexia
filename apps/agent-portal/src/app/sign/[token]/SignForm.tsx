"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { IDLE, type FormState } from "@/lib/form-state";

/**
 * Name, position, phone, a drawn signature and the agreement box. The
 * signature is drawn on a canvas with pointer events (finger, stylus or
 * mouse) and sent as a PNG data URL in a hidden field.
 */
export function SignForm({ action }: { action: (p: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signature, setSignature] = useState("");

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  if (state.status === "done") {
    return <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">{state.message}</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      {[
        ["signerName", "Your full name", "name"],
        ["signerPosition", "Your position (e.g. Owner)", "organization-title"],
        ["signerPhone", "Mobile number", "tel"],
      ].map(([name, label, ac]) => (
        <label key={name} className="block text-sm">
          <span className="mb-1 block font-medium">{label}</span>
          <input name={name} required autoComplete={ac} className="w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
        </label>
      ))}

      <div>
        <span className="mb-1 block text-sm font-medium">Signature</span>
        <canvas
          ref={canvas}
          className="h-40 w-full touch-none rounded-md border border-slate-300 bg-white"
          onPointerDown={(e) => {
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d")!;
            const p = point(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const p = point(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }}
          onPointerUp={(e) => {
            drawing.current = false;
            setSignature(e.currentTarget.toDataURL("image/png"));
          }}
        />
        <button
          type="button"
          className="mt-1 text-xs text-slate-500 underline"
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setSignature("");
          }}
        >
          Clear
        </button>
        <input type="hidden" name="signature" value={signature} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" required className="mt-1 h-4 w-4" />
        <span>I have read this agreement and agree to it on behalf of the business named above.</span>
      </label>

      {state.status === "error" && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending || !signature}
        className="w-full rounded-md bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        {pending ? "Signing…" : "Sign agreement"}
      </button>
    </form>
  );
}
