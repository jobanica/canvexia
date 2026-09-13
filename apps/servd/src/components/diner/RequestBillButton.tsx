"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { requestBill } from "@/server/orders/request-bill";

export function RequestBillButton({
  slug,
  tableToken,
  prominent = false,
  onRequested,
}: {
  slug: string;
  tableToken: string;
  prominent?: boolean;
  onRequested?: () => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const t = useTranslations("diner");

  async function handle() {
    setState("busy");
    setMsg(null);
    const res = await requestBill({ slug, tableToken });
    if (res.ok) {
      setState("done");
      onRequested?.();
    } else {
      setState("idle");
      setMsg(res.error ?? t("billError"));
    }
  }

  if (state === "done") {
    return (
      <span
        className={
          prominent
            ? "block rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-brand-primary shadow-lg ring-1 ring-brand-primary/20"
            : "text-sm font-semibold text-brand-primary"
        }
      >
        {t("billRequested")}
      </span>
    );
  }

  if (prominent) {
    return (
      <button
        onClick={handle}
        disabled={state === "busy"}
        className="rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg btn-brand disabled:opacity-60"
      >
        {state === "busy" ? t("requesting") : `🧾 ${t("requestBill")}`}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handle}
        disabled={state === "busy"}
        className="rounded-full border border-brand-ink/15 px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
      >
        {state === "busy" ? t("requesting") : t("requestBill")}
      </button>
      {msg && <span className="text-xs text-guava">{msg}</span>}
    </span>
  );
}
