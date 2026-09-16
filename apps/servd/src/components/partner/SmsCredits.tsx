"use client";

import { useActionState } from "react";
import { startTopUpAction, type TopUpState } from "@/server/partners/sms-topup-actions";

/**
 * The wallet, the packs, and where the credits went.
 *
 * THE LEDGER IS ON THIS SCREEN rather than behind an export. "Where did 400
 * credits go" is the question a prepaid balance always produces, and a partner
 * who cannot answer it stops trusting the balance.
 */
export function SmsCredits({
  wallet,
  packs,
  movements,
  topUps,
  isAdmin,
  justPaid,
}: {
  wallet: { balance: number; threshold: number; low: boolean; lastTopUpCredits: number };
  packs: { credits: number; price: string }[];
  movements: { id: string; change: number; reason: string; balanceAfter: number; createdAt: Date }[];
  topUps: { id: string; credits: number; price: string; status: string; createdAt: Date }[];
  isAdmin: boolean;
  justPaid: boolean;
}) {
  const [state, buy, pending] = useActionState<TopUpState, FormData>(startTopUpAction, null);

  return (
    <div className="space-y-5">
      {justPaid && (
        <p className="rounded-tile border border-brand-primary/25 bg-brand-primary/[0.05] px-4 py-3 text-sm">
          Thanks — payment received. Credits usually land within a minute; this page will
          show them once the gateway confirms.
        </p>
      )}

      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
          Balance
        </p>
        <p className="mt-1 font-heading text-4xl font-bold tabular-nums">
          {wallet.balance.toLocaleString("en-PH")}
        </p>
        <p className="mt-1 text-sm text-brand-ink/55">
          credits ·{" "}
          {wallet.balance === 0
            ? "sending is blocked until you top up"
            : `warning at ${wallet.threshold.toLocaleString("en-PH")}`}
        </p>
        {wallet.low && wallet.balance > 0 && (
          <p className="mt-3 rounded-lg bg-mango/10 px-3 py-2 text-sm text-brand-ink/70">
            You&rsquo;re running low. A campaign that runs out part-way through sends to some
            of your list and not the rest.
          </p>
        )}
      </section>

      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Top up</p>
        {!isAdmin && (
          <p className="mt-1 text-sm text-brand-ink/55">
            Only the partner admin can buy credits. Ask them to top up.
          </p>
        )}
        {isAdmin && (
          <form action={buy} className="mt-3 grid gap-3 sm:grid-cols-3">
            {packs.map((p) => (
              <button
                key={p.credits}
                name="credits"
                value={p.credits}
                disabled={pending}
                className="rounded-tile border border-brand-ink/15 px-4 py-4 text-left hover:border-brand-primary disabled:opacity-60"
              >
                <span className="block font-heading text-xl font-bold">
                  {p.credits.toLocaleString("en-PH")}
                </span>
                <span className="block text-xs text-brand-ink/50">credits</span>
                <span className="mt-2 block text-sm font-semibold text-brand-primary">
                  {p.price}
                </span>
              </button>
            ))}
          </form>
        )}
        {state?.error && (
          <p role="alert" className="mt-3 text-sm text-guava">
            {state.error}
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-brand-ink/45">
          Paid through CANVEXIA&rsquo;s secure checkout. Credits are added when the payment
          clears, never before.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
          <p className="border-b border-brand-ink/10 px-4 py-3 text-sm font-semibold">
            Where the credits went
          </p>
          <ul className="divide-y divide-brand-ink/[0.07]">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  <span className="block text-sm">{reasonLabel(m.reason)}</span>
                  <span className="block text-xs text-brand-ink/45">
                    {new Date(m.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block text-sm font-semibold tabular-nums ${
                      m.change < 0 ? "text-brand-ink/70" : "text-brand-primary"
                    }`}
                  >
                    {m.change > 0 ? "+" : ""}
                    {m.change.toLocaleString("en-PH")}
                  </span>
                  <span className="block text-xs tabular-nums text-brand-ink/40">
                    {m.balanceAfter.toLocaleString("en-PH")} left
                  </span>
                </span>
              </li>
            ))}
            {movements.length === 0 && (
              <li className="px-4 py-5 text-sm text-brand-ink/50">Nothing yet.</li>
            )}
          </ul>
        </section>

        <section className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
          <p className="border-b border-brand-ink/10 px-4 py-3 text-sm font-semibold">Purchases</p>
          <ul className="divide-y divide-brand-ink/[0.07]">
            {topUps.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  <span className="block text-sm">
                    {t.credits.toLocaleString("en-PH")} credits · {t.price}
                  </span>
                  <span className="block text-xs text-brand-ink/45">
                    {new Date(t.createdAt).toLocaleDateString("en-PH", {
                      timeZone: "Asia/Manila",
                    })}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    t.status === "paid"
                      ? "text-brand-primary"
                      : t.status === "failed"
                        ? "text-guava"
                        : "text-brand-ink/45"
                  }`}
                >
                  {t.status === "pending" ? "awaiting payment" : t.status}
                </span>
              </li>
            ))}
            {topUps.length === 0 && (
              <li className="px-4 py-5 text-sm text-brand-ink/50">No purchases yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Ledger reasons, in words. The column holds a key; people read sentences. */
function reasonLabel(reason: string): string {
  switch (reason) {
    case "sms_credits_purchase":
      return "Credits bought";
    case "sms_campaign":
      return "Campaign sent";
    case "sms_refund":
      return "Refund — message not delivered";
    default:
      return reason.replace(/_/g, " ");
  }
}
