"use client";

import { useActionState } from "react";
import {
  setSubdomain,
  connectCustomDomain,
  type FormState,
} from "@/server/domains/actions";
import { SubmitButton } from "./SubmitButton";

export function SubdomainForm({
  current,
  rootDomain,
}: {
  current: string;
  rootDomain: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(setSubdomain, null);
  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h3 className="font-heading font-bold">Subdomain</h3>
      <p className="text-sm text-plum-ink/50">Your diner pages on a {rootDomain} subdomain.</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          name="subdomain"
          defaultValue={current}
          placeholder="mango-grill"
          className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <span className="text-sm text-plum-ink/50">.{rootDomain}</span>
        <SubmitButton>Save</SubmitButton>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-mango">Saved.</p>}
    </form>
  );
}

export function CustomDomainForm({ current }: { current: string }) {
  const [state, action] = useActionState<FormState, FormData>(connectCustomDomain, null);
  // Connecting the first one and swapping it for a different address are the
  // same write, but they are not the same moment for the person doing it — one
  // is setup, the other is fixing a mistake on a live shop. Say which.
  const connected = !!current;
  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h3 className="font-heading font-bold">
        {connected ? "Change your domain" : "Your own domain"}
      </h3>
      <p className="text-sm text-plum-ink/50">
        {connected
          ? "Type a different address to move your shop to it. The one you're on now is released, so you can reconnect it later if you need to."
          : "Connect a domain you own (auto-SSL via Vercel)."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          name="domain"
          defaultValue={current}
          placeholder="order.mybistro.com"
          className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <SubmitButton>{connected ? "Change" : "Connect"}</SubmitButton>
      </div>
      {connected && (
        <p className="mt-2 text-xs text-plum-ink/45">
          The new address needs its own DNS records before it goes live — they appear below once
          you save. Your Servd link keeps working throughout.
        </p>
      )}
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-mango">Domain added — set the DNS records below.</p>}
    </form>
  );
}
