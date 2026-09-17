"use client";

import { useActionState, useState } from "react";
import {
  requestCustomDomain,
  clearCustomDomain,
  type DomainRequestState,
} from "@/server/partners/domain-actions";

/** Copy-to-clipboard, because a mistyped DNS value is a day lost. */
function Value({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
      className="rounded bg-brand-ink/[0.06] px-1.5 py-0.5 font-mono text-[0.8em] hover:bg-brand-ink/10"
      title="Copy"
    >
      {copied ? "copied ✓" : text}
    </button>
  );
}

/**
 * Bring a domain you already own.
 *
 * THE INSTRUCTIONS ARE THE FEATURE. This screen used to say "not wired up yet,
 * tell HQ which one" — and then gave no way to tell HQ and no records to add,
 * so a partner who wanted their own address had nothing at all to do next.
 *
 * What a partner CAN do without us is point their DNS, so that is spelled out
 * exactly, with the records copyable. What needs a credential this deployment
 * does not hold is the attach itself, and that is said plainly rather than
 * dressed up as a progress bar nothing is driving.
 *
 * APEX VS SUBDOMAIN, because they need different records and picking the wrong
 * one is the single most common way this goes wrong.
 */
export function CustomDomainForm({
  current,
  state: domainState,
  aRecordIp,
  cnameTarget,
}: {
  current: string | null;
  state: string | null;
  aRecordIp: string;
  cnameTarget: string;
}) {
  const [state, action, pending] = useActionState<DomainRequestState, FormData>(
    requestCustomDomain,
    null,
  );
  const [clearState, clear, clearing] = useActionState<DomainRequestState, FormData>(
    clearCustomDomain,
    null,
  );

  const host = current ?? "";
  // "mysari.ph" is an apex; "order.mysari.ph" is not. Two labels or fewer is
  // the honest approximation — it is wrong for a handful of TLDs like
  // "co.uk", which is why the page shows both records rather than only one.
  const isApex = host.split(".").length <= 2;
  const label = host ? host.split(".")[0] : "order";

  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <p className="text-sm font-semibold">Your own domain</p>
      <p className="mt-0.5 text-xs text-brand-ink/50">
        A domain you already own, like <code>order.yourshop.ph</code>. Your merchants and
        their customers reach you there instead of on a CANVEXIA address.
      </p>

      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          name="host"
          defaultValue={host}
          placeholder="order.yourshop.ph"
          className="min-h-[44px] min-w-[240px] flex-1 rounded-lg border border-brand-ink/15 px-3 text-sm"
        />
        <button
          disabled={pending}
          className="min-h-[44px] rounded-full px-5 text-sm font-semibold btn-brand text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : current ? "Change" : "Use this domain"}
        </button>
      </form>
      {state?.ok && <p className="mt-2 text-sm text-brand-primary">{state.ok}</p>}
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {clearState?.ok && <p className="mt-2 text-sm text-brand-ink/60">{clearState.ok}</p>}

      {current && (
        <div className="mt-4 border-t border-brand-ink/10 pt-4">
          <p className="text-sm font-semibold">
            Now add these at your domain registrar
          </p>
          <p className="mt-0.5 text-xs text-brand-ink/50">
            Wherever you bought <code>{host}</code> — Namecheap, GoDaddy, Cloudflare,
            Dynadot. Look for &ldquo;DNS&rdquo; or &ldquo;Manage records&rdquo;.
          </p>

          <ol className="mt-3 space-y-3 text-sm">
            <li className="rounded-lg bg-brand-surface p-3">
              <p className="font-semibold">
                1. {isApex ? "An A record" : "A CNAME record"}
              </p>
              <p className="mt-1 text-brand-ink/70">
                {isApex ? (
                  <>
                    Type <Value text="A" /> · Name <Value text="@" /> · Value{" "}
                    <Value text={aRecordIp} />
                  </>
                ) : (
                  <>
                    Type <Value text="CNAME" /> · Name <Value text={label} /> · Value{" "}
                    <Value text={cnameTarget} />
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-brand-ink/45">
                {isApex
                  ? "An apex domain cannot use a CNAME, which is why this one is an A record."
                  : "Some registrars want the full name here instead of just the first part. If yours rejects it, try the whole domain."}
              </p>
            </li>
            <li className="rounded-lg bg-brand-surface p-3">
              <p className="font-semibold">2. Leave everything else alone</p>
              <p className="mt-1 text-brand-ink/70">
                In particular your <strong>MX</strong> records. Changing those stops your
                email, and nothing here needs them touched.
              </p>
            </li>
            <li className="rounded-lg bg-brand-surface p-3">
              <p className="font-semibold">3. Tell us it is done</p>
              <p className="mt-1 text-brand-ink/70">
                We finish the connection at our end and the certificate is issued
                automatically. DNS usually spreads in minutes, occasionally in a few hours.
              </p>
            </li>
          </ol>

          <p className="mt-3 text-xs text-brand-ink/45">
            Status: <span className="font-semibold">{domainState ?? "requested"}</span>. It
            keeps working on its CANVEXIA address the whole time, so nothing breaks while
            you wait.
          </p>

          <form action={clear} className="mt-3">
            <button
              disabled={clearing}
              className="text-xs font-semibold text-brand-ink/45 underline hover:text-brand-ink/70"
            >
              {clearing ? "Removing…" : "Use a different domain instead"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
