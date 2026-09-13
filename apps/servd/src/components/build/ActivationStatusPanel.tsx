"use client";

import { useEffect, useRef, useState } from "react";
import { pollActivation } from "@/server/build/status-action";
import { trackPurchase } from "@/components/create/Pixel";
import type { ActivationStatus } from "@/server/build/activation";

const ACTIVATION_PESOS = 499;

/**
 * "Processing — your login is on the way." Polls until the webhook has done the
 * activation, then shows the one-time link the owner uses to set their password.
 *
 * The polling never asserts payment; it just re-reads the request (which may in
 * turn re-check with Xendit server-side if the webhook was slow).
 */
export function ActivationStatusPanel({
  requestId,
  initial,
}: {
  requestId: string;
  initial: ActivationStatus;
}) {
  const [status, setStatus] = useState(initial);

  // Tell the ad platform a restaurant actually PAID — the event Facebook should
  // be optimizing toward, rather than the clicks it would otherwise chase. The
  // ref keeps it to once per page even though this fires on every re-render
  // that follows activation.
  const reported = useRef(false);
  useEffect(() => {
    if (status.status === "activated" && !reported.current) {
      reported.current = true;
      trackPurchase(ACTIVATION_PESOS);
    }
  }, [status.status]);

  useEffect(() => {
    if (status.status === "activated") return;
    let stop = false;
    const id = setInterval(async () => {
      const next = await pollActivation(requestId);
      if (!stop && next) {
        setStatus(next);
        if (next.status === "activated") clearInterval(id);
      }
    }, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [requestId, status.status]);

  if (status.status === "activated") {
    return (
      <div className="mx-auto max-w-md rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
        <div className="text-4xl">🎉</div>
        <h1 className="mt-3 font-heading text-2xl font-bold text-plum-ink">
          {status.restaurantName} is live
        </h1>
        <p className="mt-1 text-sm text-plum-ink/55">
          Your online ordering system is yours for life — one payment, no monthly fees. Set
          your password to open your dashboard.
        </p>

        {status.claimUrl ? (
          <a
            href={status.claimUrl}
            className="mt-5 block w-full rounded-full py-3.5 font-heading text-base font-bold btn-brand"
          >
            Set my password →
          </a>
        ) : status.claimBlocked ? (
          <p className="mt-5 rounded-xl bg-cream/70 px-3 py-3 text-sm text-plum-ink/70">
            For your security the password link only opens on the device you built your menu on.
            Open this page there, or message us and we&apos;ll send it over.
          </p>
        ) : (
          <p className="mt-5 rounded-xl bg-cream/70 px-3 py-3 text-sm text-plum-ink/70">
            You&apos;ve already set your password — just sign in.
          </p>
        )}

        {status.loginUsername && (
          <p className="mt-3 text-sm text-plum-ink/60">
            Your username: <span className="font-mono font-bold">{status.loginUsername}</span>
          </p>
        )}
        <p className="mt-4 text-xs text-plum-ink/40">
          Save this page — the password link works once.
        </p>
      </div>
    );
  }

  if (status.status === "abandoned") {
    return (
      <div className="mx-auto max-w-md rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
        <h1 className="font-heading text-xl font-bold text-plum-ink">That payment didn&apos;t go through</h1>
        <p className="mt-2 text-sm text-plum-ink/55">
          No charge was made and your preview is safe. Head back and try again whenever you&apos;re
          ready.
        </p>
        <a
          href="/build"
          className="mt-5 block w-full rounded-full py-3.5 font-heading text-base font-bold btn-brand"
        >
          Back to my restaurant
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-primary/20 border-t-brand-primary" />
      <h1 className="mt-4 font-heading text-xl font-bold text-plum-ink">
        Setting up {status.restaurantName}…
      </h1>
      <p className="mt-2 text-sm text-plum-ink/55">
        We&apos;re confirming your payment and creating your account. This usually takes a few
        seconds — you can keep this page open.
      </p>
    </div>
  );
}
