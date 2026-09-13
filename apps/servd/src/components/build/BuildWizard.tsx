"use client";

import { useState, useTransition } from "react";
import { formatPeso } from "@/lib/money";
import { saveBusiness, addBuildItem, deleteBuildItem, type BuildResult } from "@/server/build/actions";
import { requestActivation } from "@/server/build/activate-action";
import type { BuildState } from "@/server/build/queries";
import { LazyVideo } from "@/components/media/LazyVideo";
import { ImageField } from "@/components/admin/ImageField";
import { compressImageFile, replaceInputFile } from "@/lib/images/compress";

/** Bundled demo reel shown on the preview step. Square, ~95 seconds. */
const DEMO_VIDEO = "/demo/servd-demo.mp4";

const MIN_ITEMS = 3;
const STEPS = ["Business", "Menu", "Preview", "Activate"] as const;
type Step = 0 | 1 | 2 | 3;

/**
 * The public builder. No login: the first save mints a build token, so the whole
 * flow is "type a name → see your restaurant" with nothing in between.
 *
 * The order of the steps is the point. The owner must reach a real, working
 * preview of THEIR menu within about two minutes — before we ask for anything.
 */
export function BuildWizard({
  initial,
  appUrl,
  startAt,
}: {
  initial: BuildState | null;
  appUrl: string;
  /** Deep link from a marketing email — open straight on that step. */
  startAt?: "activate" | "preview";
}) {
  const [state, setState] = useState<BuildState | null>(initial);
  const [step, setStep] = useState<Step>(() => {
    if (!initial) return 0;
    if (startAt === "activate" && initial.canPreview) return 3;
    if (startAt === "preview" && initial.canPreview) return 2;
    return initial.canPreview ? 2 : 1;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function apply(res: BuildResult) {
    if (res.ok) {
      setState(res.state);
      setError(null);
      return true;
    }
    setError(res.error);
    return false;
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <Progress step={step} />

      {step === 0 && (
        <BusinessStep
          state={state}
          pending={pending}
          onSubmit={(fd) =>
            start(async () => {
              if (apply(await saveBusiness(fd))) setStep(1);
            })
          }
        />
      )}

      {step === 1 && state && (
        <MenuStep
          state={state}
          pending={pending}
          onAdd={(fd) => start(async () => { apply(await addBuildItem(fd)); })}
          onDelete={(id) => start(async () => { apply(await deleteBuildItem(id)); })}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && state && (
        <PreviewStep state={state} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}

      {step === 3 && state && (
        <ActivateStep state={state} appUrl={appUrl} onBack={() => setStep(2)} />
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-guava/10 px-3 py-2 text-center text-sm text-guava">{error}</p>
      )}

      {state && (
        <p className="mt-6 text-center text-xs text-plum-ink/40">
          Your progress is saved. Come back anytime with{" "}
          <span className="break-all font-mono">{`${appUrl}/build/${state.token}`}</span>
        </p>
      )}
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  return (
    <ol className="mb-6 flex items-center gap-1">
      {STEPS.map((label, i) => (
        <li key={label} className="flex-1">
          <div
            className={`h-1.5 rounded-full ${i <= step ? "bg-brand-gradient" : "bg-plum-ink/10"}`}
          />
          <p
            className={`mt-1.5 text-[11px] font-semibold ${
              i <= step ? "text-brand-primary" : "text-plum-ink/35"
            }`}
          >
            {i + 1}. {label}
          </p>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- ① Business

function BusinessStep({
  state,
  pending,
  onSubmit,
}: {
  state: BuildState | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  const [logoPreview, setLogoPreview] = useState<string | null>(state?.logoUrl ?? null);
  const [hasNewLogo, setHasNewLogo] = useState(false);
  const ready = !!logoPreview;

  return (
    <form
      action={onSubmit}
      className="rounded-tile border border-plum-ink/10 bg-white p-5"
    >
      <h1 className="font-heading text-2xl font-bold text-plum-ink">Let&apos;s build your page</h1>
      <p className="mt-1 text-sm text-plum-ink/55">
        Two things to start — you&apos;ll see your restaurant in about a minute.
      </p>

      <label className="mt-5 block text-sm font-semibold text-plum-ink/70">Restaurant name</label>
      <input
        name="name"
        defaultValue={state?.name ?? ""}
        required
        autoFocus
        placeholder="e.g. Brew Mate Cafe"
        className="mt-1 w-full rounded-xl border border-plum-ink/15 px-3 py-3 text-base"
      />

      <label className="mt-4 block text-sm font-semibold text-plum-ink/70">Your logo</label>
      <div className="mt-1 flex items-center gap-3">
        {logoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoPreview}
            alt="Logo"
            className="h-20 w-20 rounded-xl border border-plum-ink/10 object-contain"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-plum-ink/20 text-2xl">
            📷
          </div>
        )}
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/*"
          onChange={(e) => {
            const input = e.target;
            const f = input.files?.[0];
            if (f) {
              // Preview immediately from the original — waiting on compression
              // would leave the tile blank for a beat and read as a failure.
              setLogoPreview(URL.createObjectURL(f));
              setHasNewLogo(true);
              // Then quietly swap in the smaller file for the actual upload.
              void compressImageFile(f)
                .then((res) => {
                  if (res.compressed) replaceInputFile(input, res.file);
                })
                .catch(() => {
                  /* leave the original; the server still validates it */
                });
            }
          }}
          className="text-sm"
        />
      </div>

      <label className="mt-5 block text-sm font-semibold text-plum-ink/70">Email address</label>
      <p className="text-xs text-plum-ink/45">
        We&apos;ll send your preview link here so you can pick it back up on any device.
      </p>
      <input
        name="contactEmail"
        type="email"
        required
        defaultValue={state?.contactEmail ?? ""}
        placeholder="you@example.com"
        className="mt-1 w-full rounded-xl border border-plum-ink/15 px-3 py-3 text-base"
      />

      <label className="mt-4 block text-sm font-semibold text-plum-ink/70">Mobile number</label>
      <input
        name="contactPhone"
        type="tel"
        required
        defaultValue={state?.contactPhone ?? ""}
        inputMode="tel"
        placeholder="09xx xxx xxxx"
        className="mt-1 w-full rounded-xl border border-plum-ink/15 px-3 py-3 text-base"
      />

      <label className="mt-4 block text-sm font-semibold text-plum-ink/70">
        Facebook page <span className="font-normal text-plum-ink/40">(optional)</span>
      </label>
      <input
        name="contactFb"
        defaultValue={state?.contactFb ?? ""}
        placeholder="facebook.com/yourpage"
        className="mt-1 w-full rounded-xl border border-plum-ink/15 px-3 py-3 text-base"
      />

      <button
        type="submit"
        disabled={pending || (!ready && !hasNewLogo)}
        className="mt-6 w-full rounded-full py-3.5 font-heading text-base font-bold btn-brand disabled:opacity-50"
      >
        {pending ? "Saving…" : "Next — add my menu"}
      </button>
    </form>
  );
}

// -------------------------------------------------------------------- ② Menu

function MenuStep({
  state,
  pending,
  onAdd,
  onDelete,
  onBack,
  onNext,
}: {
  state: BuildState;
  pending: boolean;
  onAdd: (fd: FormData) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [formKey, setFormKey] = useState(0);
  const left = Math.max(0, MIN_ITEMS - state.items.length);

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h1 className="font-heading text-2xl font-bold text-plum-ink">Add a few dishes</h1>
      {/* Just enough to see the page working. This is a taster, not data
          entry — the full menu gets typed once, later, on a real account. */}
      <p className="mt-1 text-sm text-plum-ink/55">
        {left > 0
          ? `Type in ${left} more and you can see your page. Your full menu comes later.`
          : "Nice — that's enough to see your page. Add more if you like."}
      </p>

      {state.items.length > 0 && (
        <ul className="mt-4 divide-y divide-plum-ink/5">
          {state.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2">
              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cream text-sm font-bold text-plum-ink/40">
                  {it.name.charAt(0)}
                </div>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-plum-ink">{it.name}</span>
                <span className="block text-xs text-plum-ink/45">{it.category}</span>
              </span>
              <span className="text-sm font-semibold">{formatPeso(it.price)}</span>
              <button
                onClick={() => onDelete(it.id)}
                disabled={pending}
                className="text-xs text-muted hover:text-guava"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        key={formKey}
        action={(fd) => {
          onAdd(fd);
          setFormKey((k) => k + 1); // clear the row so the next one is instant
        }}
        className="mt-4 space-y-2 rounded-xl bg-cream/50 p-3"
      >
        <div className="flex gap-2">
          <input
            name="name"
            required
            placeholder="Dish name"
            className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2.5 text-sm"
          />
          <input
            name="pricePesos"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="₱"
            className="w-24 rounded-lg border border-plum-ink/15 px-3 py-2.5 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <input
            name="category"
            list="build-cats"
            placeholder="Category (optional)"
            className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2.5 text-sm"
          />
          <datalist id="build-cats">
            {[...new Set(state.items.map((i) => i.category))].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {/* Compressed in the browser: a raw camera photo exceeds the
              platform's request-body cap and the upload fails before any of
              our code can explain why. */}
          <ImageField name="photo" label="Photo (optional)" className="w-full" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg border border-brand-primary/40 bg-white py-2.5 text-sm font-bold text-brand-primary disabled:opacity-50"
        >
          {pending ? "Adding…" : "+ Add item"}
        </button>
      </form>

      <div className="mt-5 flex gap-2">
        <button onClick={onBack} className="rounded-full border border-plum-ink/15 px-5 py-3 text-sm font-semibold">
          Back
        </button>
        <button
          onClick={onNext}
          disabled={state.items.length < MIN_ITEMS}
          className="flex-1 rounded-full py-3 font-heading text-base font-bold btn-brand disabled:opacity-50"
        >
          {state.items.length < MIN_ITEMS ? `Add ${left} more` : "See my restaurant →"}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- ③ Preview

function PreviewStep({
  state,
  onBack,
  onNext,
}: {
  state: BuildState;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5 text-center">
      <div className="text-4xl">🎉</div>
      <h1 className="mt-2 font-heading text-2xl font-bold text-plum-ink">
        {state.name} is ready to look at
      </h1>
      <p className="mt-1 text-sm text-plum-ink/55">
        Open it and order from yourself — this is exactly what your customers will see.
      </p>

      <a
        href={`/preview/${state.slug}`}
        className="mt-5 block w-full rounded-full py-3.5 font-heading text-base font-bold btn-brand"
      >
        Open my restaurant →
      </a>

      <div className="mt-4 flex gap-2">
        <button onClick={onBack} className="flex-1 rounded-full border border-plum-ink/15 py-3 text-sm font-semibold">
          Add more items
        </button>
        <button onClick={onNext} className="flex-1 rounded-full border border-plum-ink/15 py-3 text-sm font-semibold">
          Go live →
        </button>
      </div>

      {/* What activating actually buys them.
          BELOW the buttons on purpose: they've just built something and the
          next thing they should do is open it. A video above the CTA would be
          a two-minute detour placed in front of the moment the whole builder
          exists to reach.
          Click-to-load, so nobody on mobile data pays for five megabytes they
          didn't ask for. */}
      <div className="mt-6 border-t border-plum-ink/10 pt-5 text-left">
        <h2 className="font-heading text-base font-bold text-plum-ink">
          What you get when you activate
        </h2>
        <p className="mt-1 text-sm text-plum-ink/55">
          Orders straight to your kitchen, your own QR codes, and the takings in
          your own account — no commission to anyone.
        </p>
        <div className="mt-3">
          <LazyVideo
            src={DEMO_VIDEO}
            aspect="square"
            title="How Servd works once your restaurant is live"
            playLabel="See it in action"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ④ Activate

function ActivateStep({
  state,
  appUrl,
  onBack,
}: {
  state: BuildState;
  appUrl: string;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shareUrl = `${appUrl}/preview/${state.slug}`;

  async function activate() {
    setBusy(true);
    setError(null);
    const res = await requestActivation();
    if (res.ok) window.location.href = res.checkoutUrl;
    else {
      setBusy(false);
      setError(res.error);
    }
  }

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5 text-center">
      <h1 className="font-heading text-2xl font-bold text-plum-ink">
        Your restaurant is ready 🎉
      </h1>
      <p className="mt-1 text-sm text-plum-ink/55">
        Activate to start taking real orders, get your QR codes, and open your dashboard.
      </p>

      <ul className="mt-4 space-y-1.5 text-left text-sm text-plum-ink/70">
        {[
          "Real orders straight to your kitchen",
          "Your own ordering website + table QR codes",
          "Cashier, kitchen and sales dashboard",
          "Yours for life — one payment, no monthly fees",
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-brand-primary">✓</span>
            {line}
          </li>
        ))}
      </ul>

      <button
        onClick={activate}
        disabled={busy}
        className="mt-5 w-full rounded-full py-3.5 font-heading text-base font-bold btn-brand disabled:opacity-60"
      >
        {busy ? "Opening payment…" : "Activate for ₱499"}
      </button>
      <p className="mt-2 text-xs text-plum-ink/45">One-time. Pay with GCash or card.</p>
      {error && <p className="mt-2 text-sm text-guava">{error}</p>}

      <div className="mt-5 rounded-xl bg-cream/60 p-3 text-left">
        <p className="text-xs font-semibold text-plum-ink/60">Not ready yet?</p>
        <p className="mt-0.5 text-xs text-plum-ink/50">
          Send this to your business partner — they can browse it too.
        </p>
        <p className="mt-1 break-all font-mono text-xs text-brand-primary">{shareUrl}</p>
      </div>

      <button onClick={onBack} className="mt-4 text-xs font-semibold text-plum-ink/45 underline">
        Back to my preview
      </button>
    </div>
  );
}
