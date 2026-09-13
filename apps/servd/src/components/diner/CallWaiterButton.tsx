"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { callWaiter } from "@/server/orders/call-waiter";

export function CallWaiterButton({
  slug,
  tableToken,
}: {
  slug: string;
  tableToken: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const t = useTranslations("diner");

  async function handle() {
    setState("busy");
    const res = await callWaiter({ slug, tableToken });
    setState(res.ok ? "done" : "idle");
    if (res.ok) setTimeout(() => setState("idle"), 5000);
  }

  if (state === "done") {
    return (
      <span className="block rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-brand-primary shadow-lg ring-1 ring-brand-primary/20">
        {t("waiterCalled")}
      </span>
    );
  }

  return (
    <button
      onClick={handle}
      disabled={state === "busy"}
      className="rounded-full border border-brand-ink/15 py-3 text-center text-sm font-semibold text-brand-ink disabled:opacity-60"
    >
      {state === "busy" ? t("calling") : `🔔 ${t("callWaiter")}`}
    </button>
  );
}
