"use client";

import { useEffect, useState } from "react";

/**
 * "Powered by Servd" welcome splash shown right after the QR scan, before the
 * menu. Shows the SaaS (Servd) logo + name — not the restaurant's brand — and
 * auto-dismisses after a moment (or on tap). Uses the static Servd icon so it's
 * independent of the restaurant's colors.
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  function dismiss() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDone, 500); // let the fade-out finish
  }

  useEffect(() => {
    const t = setTimeout(dismiss, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={dismiss}
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-plum-ink px-8 text-center transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className={leaving ? "" : "animate-[fadeUp_0.6s_ease-out]"}>
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
          Powered by
        </p>
        {/* Static Servd icon — brand-independent */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/servd-icon.svg"
          alt="Servd"
          width={88}
          height={88}
          className="mx-auto rounded-[20px] shadow-xl"
        />
        <p className="mt-5 font-heading text-4xl font-extrabold tracking-tight text-white">servd</p>
        <p className="mt-2 text-sm font-medium tracking-wide text-white/60">www.servdph.com</p>
      </div>
      <p className="absolute bottom-10 text-xs text-white/40">Tap to continue</p>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
