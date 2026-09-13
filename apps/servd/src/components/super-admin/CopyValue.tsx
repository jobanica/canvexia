"use client";

import { useEffect, useRef, useState } from "react";

type State = "idle" | "copied" | "failed";

/**
 * A value with a copy button beside it.
 *
 * Unlike the link copier, this is used for credentials, so a silent failure is
 * not acceptable: somebody taps copy, pastes whatever was already on the
 * clipboard, and cannot work out why the password is wrong. The clipboard API
 * needs a secure context and can be refused outright, so a refusal says so and
 * selects the text instead, which is the manual way to get it.
 */
export function CopyValue({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<State>("idle");
  const valueRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state === "idle") return;
    timer.current = setTimeout(() => setState("idle"), 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
      // Give them the manual route rather than a dead end.
      const el = valueRef.current;
      if (el && typeof window !== "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-plum-ink/45">{label}</span>
      <span ref={valueRef} className="min-w-0 break-all font-semibold">
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        title={`Copy ${label.toLowerCase()}`}
        className="shrink-0 rounded-lg border border-plum-ink/15 bg-white p-1.5 text-plum-ink/60 transition hover:bg-cream hover:text-plum-ink"
      >
        {state === "copied" ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 012-2h10" />
          </svg>
        )}
      </button>
      {state === "copied" && (
        <span className="shrink-0 text-[11px] font-semibold text-green-600">Copied</span>
      )}
      {state === "failed" && (
        <span className="shrink-0 text-[11px] font-semibold text-guava">
          Blocked — copy the selected text
        </span>
      )}
    </div>
  );
}
