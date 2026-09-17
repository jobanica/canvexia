"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createPartnerDemo,
  scanPartnerDemoMenu,
  deletePartnerDemo,
  type DemoFormState,
  type DemoScanState,
} from "@/server/partners/demo";
import type { PartnerDemoRow } from "@/server/partners/demo-queries";
import { PartnerConvertForm } from "./PartnerConvertForm";

/**
 * `canBuild` is `merchants.create`, resolved on the server.
 *
 * Every write in this card now goes through that capability, so a seat without
 * it gets the list and the links and none of the buttons — hidden, not
 * disabled, which is the rule the rest of the portal follows. A greyed-out
 * "Delete" tells a support seat exactly what it is missing; a button that
 * silently does nothing is worse still.
 */
export function PartnerDemos({
  demos,
  appUrl,
  canBuild,
}: {
  demos: PartnerDemoRow[];
  appUrl: string;
  canBuild: boolean;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(canBuild && demos.length === 0);
  const [state, action] = useActionState<DemoFormState, FormData>(createPartnerDemo, null);

  // Clear + refresh once a demo is created.
  useEffect(() => {
    if (state?.ok) {
      setShowAdd(false);
      router.refresh();
    }
  }, [state?.ok, router]);

  const field = "w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm";

  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Storefronts</p>
          <p className="text-xs text-brand-ink/50">
            Build a live ordering page to pitch a prospect, then convert it into their account
            when they say yes.
          </p>
        </div>
        {canBuild && (
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="rounded-full border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-brand-surface"
          >
            {showAdd ? "Close" : "+ New demo"}
          </button>
        )}
      </div>

      {canBuild && showAdd && (
        <form key={state?.ok ? "ok" : "form"} action={action} className="mt-4 grid gap-2 rounded-lg border border-brand-ink/10 bg-brand-surface/40 p-3 sm:grid-cols-2">
          <input name="name" required placeholder="Restaurant name *" className={`${field} sm:col-span-2`} />
          <input name="tagline" placeholder="Tagline (optional)" className={field} />
          <input name="logoUrl" placeholder="Logo URL (optional)" className={field} />
          <input name="address" placeholder="Address (optional)" className={field} />
          <input name="phone" placeholder="Phone (optional)" className={field} />
          <div className="flex items-center gap-3 sm:col-span-2">
            <button className="rounded-full px-4 py-2 text-sm font-semibold btn-brand text-white">
              Create demo
            </button>
            {state?.error && <span className="text-sm text-guava">{state.error}</span>}
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {demos.length === 0 ? (
          <p className="text-sm text-brand-ink/50">
            {canBuild
              ? "No demos yet. Create one to pitch a prospect."
              : "No demos yet."}
          </p>
        ) : (
          demos.map((d) => (
            <DemoRow key={d.id} demo={d} appUrl={appUrl} canBuild={canBuild} />
          ))
        )}
      </div>
    </div>
  );
}

function DemoRow({
  demo,
  appUrl,
  canBuild,
}: {
  demo: PartnerDemoRow;
  appUrl: string;
  canBuild: boolean;
}) {
  const router = useRouter();
  const url = `${appUrl.replace(/\/$/, "")}/r/${demo.slug}`;
  const [copied, setCopied] = useState(false);
  const [scanState, scanAction] = useActionState<DemoScanState, FormData>(scanPartnerDemoMenu, null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scanState?.ok) router.refresh();
  }, [scanState?.ok, router]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-lg border border-brand-ink/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {demo.name}
            {demo.converted ? (
              <span className="rounded-full bg-brand-primary/15 px-2 py-0.5 text-xs font-semibold text-brand-primary">
                Live account{demo.username ? ` · ${demo.username}` : ""}
              </span>
            ) : (
              <span className="rounded-full bg-brand-ink/5 px-2 py-0.5 text-xs font-semibold text-brand-ink/55">
                Demo
              </span>
            )}
          </p>
          <p className="text-xs text-brand-ink/45">
            {demo.itemCount} item{demo.itemCount === 1 ? "" : "s"} ·{" "}
            <span className="break-all">{url}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/partner/demo/${demo.id}`}
            className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white"
          >
            Manage / menu →
          </Link>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-brand-surface"
          >
            Open ↗
          </a>
          <button
            onClick={copy}
            className="rounded-lg border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-brand-surface"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          {/* A converted account is somebody's real shop, with real orders in
              it — deleting it from here isn't a thing a partner should be able
              to do by accident. The server refuses it too. */}
          {canBuild && !demo.converted && (
            <form action={deletePartnerDemo}>
              <input type="hidden" name="id" value={demo.id} />
              <button className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-guava hover:bg-guava/10">
                Delete
              </button>
            </form>
          )}
        </div>
      </div>

      {/*
        `demo.converted` is a PROP here, not a reason to skip rendering. A server
        action re-renders this list when it finishes, so `{!demo.converted &&
        <form/>}` unmounted the component at the moment its success state held
        the only copy of the password — `converted` had just flipped true. The
        form renders nothing itself once converted.
      */}
      {canBuild && (
        <div className="mt-3 border-t border-brand-ink/5 pt-3 empty:mt-0 empty:border-0 empty:pt-0">
          <PartnerConvertForm restaurantId={demo.id} alreadyConverted={demo.converted} />
        </div>
      )}

      {/* AI menu scan — fills the storefront from a photo/PDF of the menu. */}
      {canBuild && (
        <form action={scanAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-ink/5 pt-3">
          <input type="hidden" name="restaurantId" value={demo.id} />
          <input
            ref={fileRef}
            name="images"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="text-xs"
          />
          <button className="rounded-lg border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-brand-surface">
            Scan menu photo →
          </button>
          {scanState?.ok && <span className="text-xs text-brand-primary">Added {scanState.added} items ✓</span>}
          {scanState?.error && <span className="text-xs text-guava">{scanState.error}</span>}
        </form>
      )}
    </div>
  );
}
