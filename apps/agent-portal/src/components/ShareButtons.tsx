"use client";

import { useState } from "react";

/** Copy, and the phone's own share sheet where there is one (Messenger, Viber, SMS). */
export function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      {canShare && (
        <button
          type="button"
          onClick={() => navigator.share({ title: text, text, url }).catch(() => {})}
          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Share
        </button>
      )}
    </div>
  );
}
